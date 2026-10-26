import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';
import { CHAT_ACCESS_VALUES,chatAccessAllowed,chatEntitled,deleteOrphan,listStaff,needsChatSync,orphanSubjects,syncStaff,type ChatProfile } from '../_shared/chat-gateway.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
const chatColumns='id,name,role,active,chat_access,chat_synced_at,chat_sync_error';
const viewerChatError='Tài khoản Chỉ xem chỉ được quyền Chat "Chỉ xem" hoặc "Không truy cập".';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')!;const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Cần đăng nhập.'},401);
  const {data:auth,error:authError}=await service.auth.getUser(token);if(authError||!auth.user)return reply({error:'Phiên đăng nhập không hợp lệ.'},401);
  const {data:caller}=await service.from('app_users').select('role,active').eq('id',auth.user.id).single();
  if(!caller?.active||caller.role!=='admin')return reply({error:'Chỉ quản trị viên được thực hiện thao tác này.'},403);
  const {data:chatFlag,error:chatFlagError}=await service.from('feature_flags').select('enabled').eq('key','chat_module').maybeSingle();
  const chatEnabled=!chatFlagError&&chatFlag?.enabled===true;
  const gateway={gatewayUrl:Deno.env.get('CHAT_GATEWAY_URL')||'',adminKey:Deno.env.get('CHAT_ADMIN_KEY')||''};
  // Ghi DB trước, đồng bộ Gateway sau. Lỗi Gateway không làm hỏng response: chỉ ghi trạng thái để Admin bấm "Thử lại".
  async function syncChat(id:string,force=false){
   if(!chatEnabled)return {chatSync:'skipped'};
   const {data:p,error}=await service.from('app_users').select(chatColumns).eq('id',id).single();if(error)throw error;
   if(!force&&!chatEntitled(p as ChatProfile)&&!p.chat_synced_at&&!p.chat_sync_error)return {chatSync:'skipped'};
   const result=gateway.gatewayUrl&&gateway.adminKey?await syncStaff(p as ChatProfile,gateway):{ok:false as const,revoke:!chatEntitled(p as ChatProfile),error:'Chưa cấu hình Chat Gateway'};
   const saved=await service.from('app_users').update(result.ok?{chat_synced_at:new Date().toISOString(),chat_sync_error:null}:{chat_sync_error:result.error.slice(0,300)}).eq('id',id);if(saved.error)throw saved.error;
   return result.ok?{chatSync:'ok'}:{chatSync:'failed',chatSyncError:result.error,chatRevoke:result.revoke};
  }
  const body=await req.json();
  if(!chatEnabled&&body.action==='sync-chat')return reply({error:'Phân hệ Chat đang tắt.',code:'CHAT_DISABLED'},403);
  if(!chatEnabled)delete body.chat_access;
  if(body.action==='list'){
   const profiles=await service.from('app_users').select('*').order('name');if(profiles.error)throw profiles.error;
   const emails=new Map<string,string>();let page=1;
   while(true){const users=await service.auth.admin.listUsers({page,perPage:1000});if(users.error)throw users.error;users.data.users.forEach(u=>emails.set(u.id,u.email||''));if(users.data.users.length<1000)break;page++;}
   return reply({users:profiles.data.map(p=>({...p,email:emails.get(p.id)||''}))});
  }
  if(body.action==='create'){
   if(typeof body.name!=='string'||!body.name.trim()||body.name.length>160||typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||typeof body.password!=='string'||body.password.length<8||!['admin','user','viewer'].includes(body.role))return reply({error:'Thông tin tài khoản chưa hợp lệ. Mật khẩu cần ít nhất 8 ký tự.'},400);
   if(!['none','read','write'].includes(body.care_log_access||'none')||(body.role==='viewer'&&body.care_log_access==='write'))return reply({error:'Quyền Nhật ký CSKH không hợp lệ.'},400);
   if(!['none','own','read','manage'].includes(body.call_log_access||'none')||(body.role==='viewer'&&!['none','read'].includes(body.call_log_access||'none')))return reply({error:'Quyền Nhật ký cuộc gọi không hợp lệ.'},400);
   if(!chatAccessAllowed(body.role,body.chat_access||'none'))return reply({error:body.role==='viewer'?viewerChatError:'Quyền Chat không hợp lệ.'},400);
   const created=await service.auth.admin.createUser({email:body.email,password:body.password,email_confirm:true});if(created.error)throw created.error;
   // Admin không mặc nhiên có quyền Chat (CHAT-PLAN §11 #1), nên chat_access không bị ép về none như các phân hệ khác.
   const profile=await service.from('app_users').insert({id:created.data.user.id,name:body.name.trim(),role:body.role,department_id:body.department_id||null,call_log_access:body.role==='admin'?'none':(body.call_log_access||'none'),care_log_access:body.role==='admin'?'none':(body.care_log_access||'none'),chat_access:body.chat_access||'none'});
   if(profile.error){await service.auth.admin.deleteUser(created.data.user.id);throw profile.error;}
   return reply({id:created.data.user.id,...(body.chat_access&&body.chat_access!=='none'?await syncChat(created.data.user.id):{chatSync:'skipped'})});
  }
  if(body.action==='sync-chat'&&body.all===true){
   const {data,error}=await service.from('app_users').select(chatColumns);if(error)throw error;
   if(!gateway.gatewayUrl||!gateway.adminKey)return reply({error:'Chưa cấu hình Chat Gateway (CHAT_GATEWAY_URL, CHAT_ADMIN_KEY).'},400);
   const orphans=orphanSubjects(data,await listStaff(gateway));const counts={synced:0,failed:0,orphansRemoved:0,orphansFailed:0};
   for(const p of data){const r=await syncChat(p.id,true);counts[r.chatSync==='ok'?'synced':'failed']++;}
   for(const subject of orphans){const r=await deleteOrphan(subject,gateway);counts[r.ok?'orphansRemoved':'orphansFailed']++;}
   return reply({ok:true,...counts});
  }
  if(typeof body.id!=='string'||!/^[0-9a-f-]{36}$/i.test(body.id))return reply({error:'Tài khoản không hợp lệ.'},400);
  const target=await service.from('app_users').select('id,role,chat_access').eq('id',body.id).maybeSingle();if(!target.data)return reply({error:'Không tìm thấy tài khoản CSKH.'},404);
  if(body.action==='update'){
   const update:Record<string,unknown>={};
   if('call_log_access'in body){if(!['none','own','read','manage'].includes(body.call_log_access))return reply({error:'Quyền cuộc gọi không hợp lệ.'},400);update.call_log_access=body.call_log_access;}
   if(body.role==='viewer'&&['own','manage'].includes(body.call_log_access))return reply({error:'Tài khoản Chỉ xem không được quyền ghi cuộc gọi.'},400);
   if(body.role==='admin')update.call_log_access='none';
   if('care_log_access'in body){if(!['none','read','write'].includes(body.care_log_access))return reply({error:'Quyền Nhật ký CSKH không hợp lệ.'},400);update.care_log_access=body.care_log_access;}
   if(body.role==='viewer'&&body.care_log_access==='write')return reply({error:'Tài khoản Chỉ xem không được quyền ghi nhật ký.'},400);
   if(body.role==='admin')update.care_log_access='none';
   if('chat_access'in body){if(!CHAT_ACCESS_VALUES.includes(body.chat_access))return reply({error:'Quyền Chat không hợp lệ.'},400);update.chat_access=body.chat_access;}
   if('name'in body){if(typeof body.name!=='string'||!body.name.trim()||body.name.length>160)return reply({error:'Tên không hợp lệ.'},400);update.name=body.name.trim();}
   if('role'in body){if(!['admin','user','viewer'].includes(body.role))return reply({error:'Vai trò không hợp lệ.'},400);update.role=body.role;}
   if(!chatEnabled&&body.role==='viewer'&&!chatAccessAllowed('viewer',String(target.data.chat_access??'none')))update.chat_access='read';
   // Kiểm trước khi ghi để không lộ lỗi constraint viewer_chat_read_only.
   if(!chatAccessAllowed(String(update.role??target.data.role??''),String(update.chat_access??target.data.chat_access??'none')))return reply({error:viewerChatError},400);
   if('department_id'in body)update.department_id=body.department_id||null;
   if('active'in body){if(typeof body.active!=='boolean')return reply({error:'Trạng thái không hợp lệ.'},400);if(body.id===auth.user.id&&!body.active)return reply({error:'Bạn không thể tự khóa tài khoản.'},400);update.active=body.active;}
   const result=await service.from('app_users').update(update).eq('id',body.id);if(result.error)throw result.error;
   return reply({ok:true,...(needsChatSync(update)?await syncChat(body.id):{chatSync:'skipped'})});
  }
  if(body.action==='sync-chat')return reply({ok:true,...await syncChat(body.id,true)});
  if(body.action==='reset-password'){
   if(typeof body.password!=='string'||body.password.length<8)return reply({error:'Mật khẩu cần ít nhất 8 ký tự.'},400);
   const result=await service.auth.admin.updateUserById(body.id,{password:body.password});if(result.error)throw result.error;return reply({ok:true});
  }
  return reply({error:'Thao tác không được hỗ trợ.'},400);
 }catch(error){return reply({error:error instanceof Error?error.message:(error as {message?:string})?.message||'Không thể hoàn tất thao tác.'},400);}
});
