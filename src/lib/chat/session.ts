// Phiên Chat Gateway (CHAT-PLAN §5.2, integration-guide §4). Access token chỉ giữ trong RAM.
import type { ErrorBody,SessionGrant } from './contract';
export class ChatError extends Error{
 constructor(readonly status:number,readonly code:string,readonly retryable=false,readonly correlationId=''){super(code);this.name='ChatError';}
 static async from(res:Response){let b:Partial<ErrorBody>={};try{b=await res.json();}catch{/* Lỗi không có JSON */}return new ChatError(res.status,b.code||(res.status===403?'FORBIDDEN':res.status===401?'UNAUTHENTICATED':'INTERNAL'),b.retryable===true,b.correlationId||'');}
}
export const isForbidden=(e:unknown)=>e instanceof ChatError&&e.status===403;
export type Proof={assertion:string;gatewayUrl:string};
export type SessionStatus='connecting'|'ready'|'forbidden'|'error'|'stopped';
type Options={getProof:()=>Promise<Proof>;fetch?:typeof fetch;now?:()=>number;sleep?:(ms:number)=>Promise<void>;renewMarginMs?:number;maxRetries?:number};
const wait=(ms:number)=>new Promise<void>(r=>setTimeout(r,ms));
export class ChatSession{
 base='';grant:SessionGrant|null=null;status:SessionStatus='connecting';
 private renewing:Promise<SessionGrant>|null=null;private listeners=new Set<()=>void>();private timer:ReturnType<typeof setTimeout>|undefined;private stopped=false;
 constructor(private o:Options){}
 private get fetch(){return this.o.fetch??fetch.bind(globalThis);}
 private now(){return (this.o.now??Date.now)();}
 subscribe(fn:()=>void){this.listeners.add(fn);return ()=>{this.listeners.delete(fn);};}
 private set(status:SessionStatus){if(this.status!==status){this.status=status;this.listeners.forEach(fn=>fn());}}
 // Single-flight: nhiều request cùng hết hạn hoặc cùng nhận 401 chỉ gia hạn một lần.
 renew():Promise<SessionGrant>{
  if(this.stopped)return Promise.reject(new ChatError(0,'STOPPED'));
  this.renewing??=this.open().finally(()=>{this.renewing=null;});
  return this.renewing;
 }
 private async open():Promise<SessionGrant>{
  for(let attempt=0;;attempt++){
   let proven=false;
   try{
    // Assertion chỉ dùng một lần: mỗi lần thử lại xin assertion mới.
    const proof=await this.o.getProof();proven=true;this.base=proof.gatewayUrl.replace(/\/+$/,'');
    const res=await this.fetch(`${this.base}/sessions`,{method:'POST',credentials:'omit',headers:{'content-type':'application/json'},body:JSON.stringify({proof:proof.assertion})});
    if(!res.ok)throw await ChatError.from(res);
    const grant=await res.json() as SessionGrant;if(this.stopped)throw new ChatError(0,'STOPPED');
    this.grant=grant;this.set('ready');this.schedule();return grant;
   }catch(e){
    if(isForbidden(e)){this.grant=null;this.set('forbidden');if(proven)console.warn('[chat] chat-session đã cấp assertion nhưng Gateway trả 403: kiểm sổ đăng ký nhân viên hoặc ALLOWED_ORIGINS của Gateway.');throw e;}
    const retryable=e instanceof ChatError?e.retryable||e.status>=500:e instanceof TypeError;
    if(this.stopped||!retryable||attempt>=(this.o.maxRetries??5)){if(!this.stopped)this.set('error');throw e;}
    // Lần mở đầu tiên Gateway PoC có thể khởi động lạnh khoảng 20 giây.
    await (this.o.sleep??wait)(Math.min(16000,1000*2**attempt));
   }
  }
 }
 // Gia hạn chủ động trước hạn khi tab đang hiển thị; tab ẩn thì để hết hạn và gia hạn khi cần.
 private schedule(){
  clearTimeout(this.timer);if(!this.grant||typeof document==='undefined')return;
  const delay=Date.parse(this.grant.expiresAt)-this.now()-(this.o.renewMarginMs??50000);
  this.timer=setTimeout(()=>{if(document.visibilityState==='visible')void this.renew().catch(()=>{});},Math.max(1000,delay));
 }
 async token(){const g=this.grant;if(!g||Date.parse(g.expiresAt)-this.now()<45000)return (await this.renew()).accessToken;return g.accessToken;}
 invalidate(token?:string){if(!token||this.grant?.accessToken===token)this.grant=null;}
 async call<T>(method:string,path:string,body?:unknown,options:{signal?:AbortSignal}={},retried=false):Promise<T>{
  options.signal?.throwIfAborted();
  const token=await this.token();
  options.signal?.throwIfAborted();
  const res=await this.fetch(`${this.base}${path}`,{method,credentials:'omit',signal:options.signal,headers:{authorization:`Bearer ${token}`,...(body===undefined?{}:{'content-type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  // 401: gia hạn một lần rồi thử lại; vẫn 401 thì báo lỗi.
  if(res.status===401&&!retried){this.invalidate(token);return this.call<T>(method,path,body,options,true);}
  if(!res.ok){const e=await ChatError.from(res);if(res.status===401)this.set('error');throw e;}
  return (res.status===204?undefined:await res.json()) as T;
 }
 // Đăng xuất hoặc đổi người dùng: thu hồi phiên ở Gateway, bỏ qua lỗi.
 async stop(){
  this.stopped=true;clearTimeout(this.timer);const g=this.grant;this.grant=null;this.set('stopped');
  if(g&&this.base)await this.fetch(`${this.base}/sessions/current`,{method:'DELETE',credentials:'omit',keepalive:true,headers:{authorization:`Bearer ${g.accessToken}`}}).catch(()=>{});
 }
}
