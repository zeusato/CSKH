import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const url=process.env.VITE_SUPABASE_URL;const ref=new URL(url).hostname.split('.')[0];const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw new Error('Cần SUPABASE_ACCESS_TOKEN trong .env.');
async function api(path,method='GET',body){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`Management API ${r.status}: ${await r.text()}`);const text=await r.text();return text?JSON.parse(text):null;}
const requested=process.argv.find(x=>x.startsWith('--function='))?.split('=')[1];
if(requested&&!['admin-users','storage-cleanup'].includes(requested))throw new Error('Unknown function');
for(const name of requested?[requested]:['admin-users','storage-cleanup']){
 const form=new FormData();form.append('metadata',JSON.stringify({name,entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([await fs.readFile(`supabase/functions/${name}/index.ts`,'utf8')],{type:'application/typescript'}),'index.ts');
 const result=await api(`functions/deploy?slug=${name}`,'POST',form);console.log(`${name}: ${result.status}`);
}
if(process.argv.includes('--functions-only')||requested)process.exit(0);
const workerToken=crypto.randomBytes(32).toString('hex');
await api('secrets','POST',[{name:'CSKH_WORKER_TOKEN',value:workerToken}]);
// Keep scheduler credentials in Vault. No service-role key is stored in cron SQL or browser code.
await api('database/query','POST',{query:`
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ declare secret_id uuid; begin
 select id into secret_id from vault.secrets where name='cskh_worker_token';
 if secret_id is null then perform vault.create_secret('${workerToken}','cskh_worker_token');
 else perform vault.update_secret(secret_id,'${workerToken}'); end if;
end $$;
select cron.schedule('cskh-storage-cleanup','* * * * *', $job$
 select net.http_post(url:='${url}/functions/v1/storage-cleanup',headers:=jsonb_build_object('Content-Type','application/json','x-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='cskh_worker_token')),body:='{}'::jsonb,timeout_milliseconds:=30000);
$job$);`});
console.log('Storage cleanup: lịch chạy mỗi phút đã bật, token lưu trong Vault.');
const config=await api('config/auth');const appUrl=process.env.APP_URL||'http://localhost:5173';
const redirects=[...new Set([...(config.uri_allow_list||'').split(',').filter(Boolean),`${appUrl}/reset-password`,'http://127.0.0.1:5173/reset-password'])];
await api('config/auth','PATCH',{password_min_length:8,disable_signup:true,site_url:appUrl,uri_allow_list:redirects.join(',')});
console.log('Auth: tắt tự đăng ký, cấu hình URL đặt lại mật khẩu.');
