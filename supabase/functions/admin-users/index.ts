import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!;const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Cần đăng nhập.'},401);
  const {data:auth,error:authError}=await service.auth.getUser(token);if(authError||!auth.user)return reply({error:'Phiên đăng nhập không hợp lệ.'},401);
  const {data:caller}=await service.from('app_users').select('role,active').eq('id',auth.user.id).single();
  if(!caller?.active||caller.role!=='admin')return reply({error:'Chỉ quản trị viên được thực hiện thao tác này.'},403);
  const body=await req.json();
  if(body.action==='list'){
   const profiles=await service.from('app_users').select('*').order('name');if(profiles.error)throw profiles.error;
   const emails=new Map<string,string>();let page=1;
   while(true){const users=await service.auth.admin.listUsers({page,perPage:1000});if(users.error)throw users.error;users.data.users.forEach(u=>emails.set(u.id,u.email||''));if(users.data.users.length<1000)break;page++;}
   return reply({users:profiles.data.map(p=>({...p,email:emails.get(p.id)||''}))});
  }
  if(body.action==='create'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>160||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||typeof body.password!=='string'||body.password.length<8||!['admin','user','viewer'].includes(body.role))return reply({error:'Thông tin tài khoản chưa hợp lệ. Mật khẩu cần ít nhất 8 ký tự.'},400);
   if(!['none','read','write'].includes(body.care_log_access||'none')||(body.role==='viewer'&&body.care_log_access==='write'))return reply({error:'Quyền Nhật ký CSKH không hợp lệ.'},400);
   const created=await service.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true});if(created.error)throw created.error;
   const profile=await service.from('app_users').insert({id:created.data.user.id,name:body.name.trim(),role:body.role,department_id:body.department_id||null,care_log_access:body.role==='admin'?'none':(body.care_log_access||'none')});
   if(profile.error){await service.auth.admin.deleteUser(created.data.user.id);throw profile.error;}
   return reply({id:created.data.user.id});
  }
  if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))return reply({error:'Tài khoản không hợp lệ.'},400);
  const target=await service.from('app_users').select('id').eq('id',body.id).maybeSingle();if(!target.data)return reply({error:'Không tìm thấy tài khoản CSKH.'},404);
  if(body.action==='update'){
   const update:Record<string,unknown>={};
   if('care_log_access'in body){if(!['none','read','write'].includes(body.care_log_access))return reply({error:'Quyền Nhật ký CSKH không hợp lệ.'},400);update.care_log_access=body.care_log_access;}
   if(body.role==='viewer'&&body.care_log_access==='write')return reply({error:'Tài khoản Chỉ xem không được quyền ghi nhật ký.'},400);
   if(body.role==='admin')update.care_log_access='none';
   if('name'in body){if(typeof body.name!=='string'||!body.name.trim()||body.name.length>160)return reply({error:'Tên không hợp lệ.'},400);update.name=body.name.trim();}
   if('role'in body){if(!['admin','user','viewer'].includes(body.role))return reply({error:'Vai trò không hợp lệ.'},400);update.role=body.role;}
   if('department_id'in body)update.department_id=body.department_id||null;
   if('active'in body){if(typeof body.active!=='boolean')return reply({error:'Trạng thái không hợp lệ.'},400);if(body.id===auth.user.id&&!body.active)return reply({error:'Bạn không thể tự khóa tài khoản.'},400);update.active=body.active;}
   const result=await service.from('app_users').update(update).eq('id',body.id);if(result.error)throw result.error;
   return reply({ok:true});
  }
  if(body.action==='reset-password'){
   if(typeof body.password!=='string'||body.password.length<8)return reply({error:'Mật khẩu cần ít nhất 8 ký tự.'},400);
   const result=await service.auth.admin.updateUserById(body.id,{password:body.password});if(result.error)throw result.error;return reply({ok:true});
  }
  return reply({error:'Thao tác không được hỗ trợ.'},400);
 }catch(error){return reply({error:error instanceof Error?error.message:(error as {message?:string})?.message||'Không thể hoàn tất thao tác.'},400);}
});
