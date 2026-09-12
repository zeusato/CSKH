import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-worker-token','Access-Control-Allow-Methods':'POST, OPTIONS'};
Deno.serve(async(req:Request)=>{
 const reply=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 const workerToken=Deno.env.get('CSKH_WORKER_TOKEN');const isWorker=Boolean(workerToken&&req.headers.get('x-worker-token')===workerToken);
 if(!isWorker){
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Unauthorized'},401);
  const {data,error}=await service.auth.getUser(token);if(error||!data.user)return reply({error:'Unauthorized'},401);
  const profile=await service.from('app_users').select('active,role').eq('id',data.user.id).single();if(!profile.data?.active||!['admin','user'].includes(profile.data.role))return reply({error:'Forbidden'},403);
 }
 try{
  const jobs=await service.rpc('claim_storage_gc',{p_limit:100});if(jobs.error)throw jobs.error;let removed=0;let failed=0;
  for(const job of jobs.data){const {error}=await service.storage.from('ticket-images').remove([job.path]);const finish=await service.rpc('finish_storage_gc',{p_id:job.id,p_error:error?.message||null});if(error||finish.error)failed++;else removed++;}
  return reply({removed,failed});
 }catch{return reply({error:'Không thể dọn ảnh. Hệ thống sẽ thử lại ở lần chạy tiếp theo.'},500);}
});
