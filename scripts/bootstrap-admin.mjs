import {createClient} from '@supabase/supabase-js';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const client=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const email=process.env.ADMIN_EMAIL;if(!email)throw new Error('Thêm ADMIN_EMAIL và ADMIN_NAME vào .env rồi chạy lại. Không cần đặt mật khẩu trong .env.');
const password=crypto.randomBytes(20).toString('base64url')+'aA1!';
const {data,error}=await client.auth.admin.createUser({email,password,email_confirm:true});if(error)throw error;
const profile=await client.from('app_users').insert({id:data.user.id,name:process.env.ADMIN_NAME||'Quản trị CSKH',role:'admin'});
if(profile.error){await client.auth.admin.deleteUser(data.user.id);throw profile.error;}
await fs.mkdir('.local',{recursive:true});await fs.writeFile('.local/admin-credentials.txt',`Email: ${email}\nMật khẩu ban đầu: ${password}\nĐổi mật khẩu sau khi đăng nhập.\n`);
console.log('Đã tạo Admin. Thông tin đăng nhập lưu riêng ở .local/admin-credentials.txt (không đưa vào Git).');
