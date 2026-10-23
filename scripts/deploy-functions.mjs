import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {bundleFunction} from './function-bundle.mjs';
const url=process.env.VITE_SUPABASE_URL;const ref=new URL(url).hostname.split('.')[0];const token=process.env.SUPABASE_ACCESS_TOKEN;
if(!token)throw new Error('Cần SUPABASE_ACCESS_TOKEN trong .env.');
async function api(path,method='GET',body){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`Management API ${r.status}: ${await r.text()}`);const text=await r.text();return text?JSON.parse(text):null;}
const functions=['admin-users','storage-cleanup','chat-session'];
const requested=process.argv.find(x=>x.startsWith('--function='))?.split('=')[1];
if(requested&&!functions.includes(requested))throw new Error('Unknown function');
// Secret Chat Gateway: khóa đọc từ file (không đưa private key/admin key vào lịch sử shell). Chỉ đặt secret, không deploy.
if(process.argv.includes('--chat-secrets')){
 const read=async(file,value)=>file?(await fs.readFile(file,'utf8')).trim():value;
 const values={CHAT_GATEWAY_URL:process.env.CHAT_GATEWAY_URL,CHAT_ASSERTION_KID:process.env.CHAT_ASSERTION_KID,CHAT_ASSERTION_PRIVATE_KEY:await read(process.env.CHAT_ASSERTION_PRIVATE_KEY_FILE,process.env.CHAT_ASSERTION_PRIVATE_KEY),CHAT_ADMIN_KEY:await read(process.env.CHAT_ADMIN_KEY_FILE,process.env.CHAT_ADMIN_KEY),CHAT_ALLOWED_ORIGINS:process.env.CHAT_ALLOWED_ORIGINS||[process.env.APP_URL,'http://127.0.0.1:5173'].filter(Boolean).join(',')};
 const missing=Object.entries(values).filter(([,v])=>!v).map(([k])=>k);if(missing.length)throw new Error(`Thiếu ${missing.join(', ')} (xem docs/CHAT.md).`);
 await api('secrets','POST',Object.entries(values).map(([name,value])=>({name,value})));console.log(`Chat secrets: đã đặt ${Object.keys(values).join(', ')}.`);process.exit(0);
}
for(const name of requested?[requested]:functions){
 const form=new FormData();form.append('metadata',JSON.stringify({name,entrypoint_path:'index.ts',verify_jwt:false}));form.append('file',new Blob([await bundleFunction(name)],{type:'application/typescript'}),'index.ts');
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
