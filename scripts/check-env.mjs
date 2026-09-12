import {loadEnv} from 'vite';
const env={...loadEnv('production',process.cwd(),'VITE_SUPABASE_'),...process.env};
const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_ANON_KEY;
if(!url||!key)throw new Error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY. Thêm vào Environment Variables rồi build lại.');
if(new URL(url).protocol!=='https:')throw new Error('VITE_SUPABASE_URL phải dùng HTTPS.');
let role;
try{role=JSON.parse(Buffer.from(key.split('.')[1]||'','base64url').toString()).role;}catch{}
if(role==='service_role'||key.startsWith('sb_secret_'))throw new Error('Không được dùng service-role/secret key làm VITE_SUPABASE_ANON_KEY.');
console.log('Public Supabase environment: valid.');
