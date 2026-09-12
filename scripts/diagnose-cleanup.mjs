import {createClient} from '@supabase/supabase-js';
const service=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const response=await service.rpc('claim_storage_gc',{p_limit:1});
console.log(JSON.stringify({error:response.error,claimed:response.data?.length}));
if(response.data?.length)for(const job of response.data){const remove=await service.storage.from('ticket-images').remove([job.path]);console.log(JSON.stringify({storageError:remove.error}));const finish=await service.rpc('finish_storage_gc',{p_id:job.id,p_error:remove.error?.message||null});console.log(JSON.stringify({finishError:finish.error}));}
