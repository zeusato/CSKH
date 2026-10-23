// Logic Chat Gateway dùng chung cho admin-users và chat-session. Không import gì: deploy-functions.mjs chèn nguyên file này vào index.ts.
// Hợp đồng: docs/chat-gateway/integration-guide.md §3, §6.1.
export type ChatAccess='none'|'read'|'agent'|'supervisor';
export type ChatProfile={id:string;name:string;role:string;active:boolean;chat_access:ChatAccess};
export type StaffRegistration={issuer:string;subject:string;displayName:string|null;roles:string[];queueIds:string[];status:'active'|'disabled';updatedAt:string};
export type ChatSyncResult={ok:true}|{ok:false;error:string;revoke:boolean};
export const CHAT_ISSUER='cskh-desk';
export const CHAT_ACCESS_VALUES:ChatAccess[]=['none','read','agent','supervisor'];
export const CHAT_SYNC_FIELDS=['name','role','active','chat_access'];
const roleOf:Record<Exclude<ChatAccess,'none'>,string>={read:'observer',agent:'agent',supervisor:'supervisor'};

// Đợt đầu chỉ có một pool chung (CHAT-PLAN §3.3). Đổi ở đây khi có định tuyến queue.
export function chatQueuesFor(_profile:ChatProfile):string[]{return ['support-default'];}
export function chatAccessAllowed(role:string,access:string){return CHAT_ACCESS_VALUES.includes(access as ChatAccess)&&(role!=='viewer'||access==='none'||access==='read');}
export function chatEntitled(p:ChatProfile){return p.active&&p.chat_access!=='none'&&chatAccessAllowed(p.role,p.chat_access);}
export function needsChatSync(update:Record<string,unknown>){return CHAT_SYNC_FIELDS.some(key=>key in update);}
export function gatewayBase(url:string){return url.replace(/\/+$/,'').replace(/\/v1\/chat$/,'')+'/v1/chat';}
export function staffPath(subject:string){return `/admin/staff/${encodeURIComponent(CHAT_ISSUER)}/${encodeURIComponent(subject)}`;}
export function registrationBody(p:ChatProfile){return {displayName:p.name.slice(0,200),roles:[roleOf[p.chat_access as Exclude<ChatAccess,'none'>]],queueIds:chatQueuesFor(p)};}

type GatewayOptions={gatewayUrl:string;adminKey:string;fetch?:typeof fetch;timeoutMs?:number};
async function adminCall(o:GatewayOptions,method:string,path:string,body?:unknown){
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),o.timeoutMs??10000);
 try{return await (o.fetch??fetch)(gatewayBase(o.gatewayUrl)+path,{method,signal:controller.signal,headers:{authorization:`Bearer ${o.adminKey}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});}
 finally{clearTimeout(timer);}
}
async function failure(res:Response){let code='';try{code=String((await res.json())?.code||'');}catch{/* Gateway lỗi không có JSON */}return `Gateway HTTP ${res.status}${code?' '+code.slice(0,60):''}`;}
function networkError(e:unknown){return e instanceof Error&&e.name==='AbortError'?'Gateway không phản hồi sau 10 giây':'Không kết nối được Gateway';}

// PUT khi còn quyền, DELETE khi khóa hoặc gỡ quyền (404 coi là đã gỡ). Không ném lỗi: DB đã ghi xong thì người gọi vẫn trả ok.
export async function syncStaff(p:ChatProfile,o:GatewayOptions):Promise<ChatSyncResult>{
 const revoke=!chatEntitled(p);
 try{
  const res=revoke?await adminCall(o,'DELETE',staffPath(p.id)):await adminCall(o,'PUT',staffPath(p.id),registrationBody(p));
  if(res.ok||(revoke&&res.status===404)){await res.body?.cancel();return {ok:true};}
  return {ok:false,revoke,error:await failure(res)};
 }catch(e){return {ok:false,revoke,error:networkError(e)};}
}
export async function listStaff(o:GatewayOptions):Promise<StaffRegistration[]>{
 let res:Response;try{res=await adminCall(o,'GET','/admin/staff');}catch(e){throw new Error(networkError(e));}
 if(!res.ok)throw new Error(await failure(res));return ((await res.json()).items||[]) as StaffRegistration[];
}
// Đăng ký còn active ở Gateway mà DB không còn tài khoản (ví dụ user bị xóa thẳng trên dashboard). Tài khoản còn trong DB do syncStaff xử lý.
export function orphanSubjects(profiles:{id:string}[],registrations:StaffRegistration[]){
 const ids=new Set(profiles.map(p=>p.id));
 return registrations.filter(r=>r.issuer===CHAT_ISSUER&&r.status==='active'&&!ids.has(r.subject)).map(r=>r.subject);
}
export async function deleteOrphan(subject:string,o:GatewayOptions):Promise<ChatSyncResult>{
 try{const res=await adminCall(o,'DELETE',staffPath(subject));if(res.ok||res.status===404){await res.body?.cancel();return {ok:true};}return {ok:false,revoke:true,error:await failure(res)};}
 catch(e){return {ok:false,revoke:true,error:networkError(e)};}
}

// Assertion EdDSA cho kind=staff (integration-guide §3). Không có roles/queue_ids/account_refs.
export function base64url(bytes:Uint8Array){let s='';for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
const encodeJson=(o:object)=>base64url(new TextEncoder().encode(JSON.stringify(o)));
export function pemToDer(pem:string){return Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s|\\n/g,'')),c=>c.charCodeAt(0));}
export function importSigningKey(pem:string){return crypto.subtle.importKey('pkcs8',pemToDer(pem),{name:'Ed25519'},false,['sign']);}
// Chỉ gọi sau khi auth.getUser đã xác thực token; ở đây chỉ đọc claim.
export function jwtPayload(token:string):Record<string,unknown>{
 const part=token.split('.')[1];if(!part)throw new Error('Token không hợp lệ');
 const b=part.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b+'='.repeat((4-b.length%4)%4)),c=>c.charCodeAt(0))));
}
export function assertionClaims(p:ChatProfile,supabaseClaims:Record<string,unknown>,nowSec:number,jti:string){
 const sid=typeof supabaseClaims.session_id==='string'?supabaseClaims.session_id:'';const sidExp=Number(supabaseClaims.exp);
 if(!sid||!Number.isFinite(sidExp)||sidExp<=nowSec)throw new Error('Phiên đăng nhập không hợp lệ');
 return {iss:CHAT_ISSUER,aud:'chat-gateway',sub:p.id,kind:'staff',name:p.name.slice(0,200),sid,sid_exp:Math.floor(sidExp),jti,iat:nowSec,exp:nowSec+60};
}
export async function signAssertion(claims:Record<string,unknown>,key:CryptoKey,kid:string){
 const data=`${encodeJson({alg:'EdDSA',typ:'JWT',kid})}.${encodeJson(claims)}`;
 return `${data}.${base64url(new Uint8Array(await crypto.subtle.sign('Ed25519',key,new TextEncoder().encode(data))))}`;
}
export function originAllowed(origin:string|null,allowed:string[]){return origin===null||allowed.includes(origin);}
