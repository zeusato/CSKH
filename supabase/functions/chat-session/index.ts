import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';
import { assertionClaims,chatEntitled,gatewayBase,importSigningKey,jwtPayload,originAllowed,signAssertion,type ChatProfile } from '../_shared/chat-gateway.ts';
// Cấp assertion staff cho Chat Gateway (CHAT-PLAN §4). Endpoint cấp danh tính: chỉ origin CSKH, không log assertion hay token.
const origins=(Deno.env.get('CHAT_ALLOWED_ORIGINS')||'http://127.0.0.1:5173').split(',').map(x=>x.trim()).filter(Boolean);
let signingKey:Promise<CryptoKey>|null=null;
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('Origin');
 const cors:Record<string,string>={Vary:'Origin',...(origin&&origins.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'}:{})};
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!originAllowed(origin,origins))return reply({error:'Origin không được phép.'},403);
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Method not allowed'},405);
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer /i,'');if(!token)return reply({error:'Cần đăng nhập.'},401);
  const service=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {data:auth,error:authError}=await service.auth.getUser(token);if(authError||!auth.user)return reply({error:'Phiên đăng nhập không hợp lệ.'},401);
  const {data:profile,error}=await service.from('app_users').select('id,name,role,active,chat_access').eq('id',auth.user.id).maybeSingle();if(error)throw error;
  // Lớp chặn thứ hai: người đã bị khóa hoặc gỡ quyền không lấy được phiên mới, kể cả khi Gateway chưa kịp hủy đăng ký.
  if(!profile||!chatEntitled(profile as ChatProfile))return reply({error:'Tài khoản chưa được cấp quyền Chat.'},403);
  const pem=Deno.env.get('CHAT_ASSERTION_PRIVATE_KEY'),kid=Deno.env.get('CHAT_ASSERTION_KID'),gatewayUrl=Deno.env.get('CHAT_GATEWAY_URL');
  if(!pem||!kid||!gatewayUrl)return reply({error:'Chưa cấu hình Chat Gateway.'},503);
  signingKey??=importSigningKey(pem);
  let claims;try{claims=assertionClaims(profile as ChatProfile,jwtPayload(token),Math.floor(Date.now()/1000),crypto.randomUUID());}catch{return reply({error:'Phiên đăng nhập không hợp lệ.'},401);}
  return reply({assertion:await signAssertion(claims,await signingKey,kid),gatewayUrl:gatewayBase(gatewayUrl)});
 }catch(e){signingKey=null;return reply({error:e instanceof Error&&/Ed25519|pkcs8|key/i.test(e.message)?'Khóa ký Chat chưa đúng cấu hình.':'Không cấp được phiên Chat.'},500);}
});
