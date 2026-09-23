import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', {headers:cors})
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const token = req.headers.get('Authorization') || ''
    const caller = createClient(url, anon, {global:{headers:{Authorization:token}}})
    const admin = createClient(url, service)
    const {data:{user}} = await caller.auth.getUser()
    if (!user) throw new Error('Sesión inválida')
    const {data:profile} = await admin.from('perfiles').select('rol,activo').eq('id',user.id).single()
    if (!profile?.activo || profile.rol !== 'admin') return json({error:'No autorizado'},403)
    const body = await req.json()
    const action = body.action || 'create'

    if (action === 'create') {
      const {nombre,email,password,barrio_id} = body
      if (!nombre || !email || !password || !barrio_id) return json({error:'Faltan datos obligatorios'},400)
      const {data:created,error} = await admin.auth.admin.createUser({email,password,email_confirm:true})
      if (error) throw error
      const {error:profileError} = await admin.from('perfiles').insert({id:created.user.id,nombre,email,rol:'encargado',barrio_id,activo:true})
      if (profileError) { await admin.auth.admin.deleteUser(created.user.id); throw profileError }
      return json({ok:true,id:created.user.id},201)
    }

    if (action === 'update') {
      const {id,nombre,email,password,barrio_id} = body
      if (!id || !nombre || !email || !barrio_id) return json({error:'Faltan datos obligatorios'},400)
      const {data:target,error:targetError} = await admin.from('perfiles').select('rol').eq('id',id).single()
      if (targetError || target?.rol !== 'encargado') return json({error:'Encargado no encontrado'},404)
      const authChanges:Record<string,unknown> = {email,email_confirm:true}
      if (password) authChanges.password = password
      const {error:authError} = await admin.auth.admin.updateUserById(id,authChanges)
      if (authError) throw authError
      const {error:updateError} = await admin.from('perfiles').update({nombre,email,barrio_id,activo:true}).eq('id',id)
      if (updateError) throw updateError
      return json({ok:true})
    }

    if (action === 'delete') {
      const {id} = body
      if (!id || id === user.id) return json({error:'No podés eliminar tu propia cuenta'},400)
      const {data:target,error:targetError} = await admin.from('perfiles').select('rol').eq('id',id).single()
      if (targetError || target?.rol !== 'encargado') return json({error:'Encargado no encontrado'},404)
      await admin.from('auditoria').delete().eq('usuario_id',id)
      await admin.from('votantes').update({registrado_por:null}).eq('registrado_por',id)
      await admin.from('votantes').update({voto_registrado_por:null}).eq('voto_registrado_por',id)
      const {error:deleteError} = await admin.auth.admin.deleteUser(id)
      if (deleteError) throw deleteError
      return json({ok:true})
    }

    return json({error:'Acción no válida'},400)
  } catch (e) { return json({error:e instanceof Error?e.message:'Error inesperado'},400) }
})

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})}
