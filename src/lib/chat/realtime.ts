// WebSocket Chat Gateway (CHAT-PLAN §5.3, integration-guide §7). Event chỉ có metadata; nhận event thì gọi lại HTTP.
import type { ChatEvent } from './contract';
import { isForbidden,type ChatSession } from './session';
export type RealtimeStatus='connecting'|'live'|'reconnecting'|'offline'|'failed'|'stopped';
type Handlers={onEvents:(events:ChatEvent[])=>void;onSync:()=>void;onReady?:()=>void;onStatus?:(s:RealtimeStatus)=>void;onForbidden?:()=>void};
type Options={WebSocket?:typeof WebSocket;random?:()=>number;offlineAfterMs?:number};
export function realtimeUrl(base:string){return base.replace(/^http/,'ws')+'/realtime';}
export class ChatRealtime{
 status:RealtimeStatus='connecting';cursor:string|null=null;
 private ws:WebSocket|null=null;private attempt=0;private stopped=false;private retryTimer:ReturnType<typeof setTimeout>|undefined;private offlineTimer:ReturnType<typeof setTimeout>|undefined;
 private seen=new Set<string>();private seenOrder:string[]=[];private revisions=new Map<string,number>();
 constructor(private session:ChatSession,private h:Handlers,private o:Options={}){}
 start(){void this.open();}
 stop(){this.stopped=true;clearTimeout(this.retryTimer);clearTimeout(this.offlineTimer);const ws=this.ws;this.ws=null;ws?.close(1000);this.set('stopped');}
 private set(s:RealtimeStatus){if(this.status!==s){this.status=s;this.h.onStatus?.(s);}}
 // Mất kết nối quá 10 giây mới báo cho người dùng, tránh chip nhấp nháy khi gia hạn phiên định kỳ.
 private markDown(){if(this.offlineTimer===undefined&&!this.stopped)this.offlineTimer=setTimeout(()=>{if(this.status!=='live'&&!this.stopped&&this.status!=='failed')this.set('offline');},this.o.offlineAfterMs??10000);}
 private markUp(){clearTimeout(this.offlineTimer);this.offlineTimer=undefined;}
 private async open(){
  if(this.stopped)return;
  let ticket:string;
  try{ticket=(await this.session.call<{ticket:string}>('POST','/realtime-tickets')).ticket;}
  catch(e){if(isForbidden(e)){this.h.onForbidden?.();this.stop();return;}this.retry();return;}
  if(this.stopped)return;
  const WS=this.o.WebSocket??WebSocket;const ws=new WS(realtimeUrl(this.session.base));this.ws=ws;
  // Không đưa ticket vào URL; gửi frame auth kèm cursor cuối để Gateway trả bù event đã lỡ.
  ws.onopen=()=>ws.send(JSON.stringify({type:'auth',ticket,...(this.cursor?{cursor:this.cursor}:{})}));
  ws.onmessage=e=>{if(this.ws!==ws)return;let f;try{f=JSON.parse(String(e.data));}catch{return;}this.frame(f);};
  ws.onclose=e=>{
   if(this.ws!==ws||this.stopped)return;this.ws=null;
   // 4403 = sai giao thức (lỗi code client): dừng, không reconnect vô hạn.
   if(e.code===4403){console.error('[chat] WebSocket đóng 4403: sai giao thức realtime');this.markUp();this.set('failed');return;}
   if(e.code===4401)this.session.invalidate();
   this.retry(e.code===4401);
  };
 }
 private frame(f:{type?:string;cursor?:string;events?:ChatEvent[]}){
  if(f.type==='ready'){if(f.cursor)this.cursor=f.cursor;this.attempt=0;this.markUp();this.set('live');this.h.onReady?.();return;}
  if(f.type==='events'){const events=(f.events||[]).filter(ev=>this.accept(ev));if(events.length)this.h.onEvents(events);if(f.cursor)this.cursor=f.cursor;return;}
  if(f.type==='sync.required'){if(f.cursor)this.cursor=f.cursor;this.revisions.clear();this.h.onSync();return;}
  // session.expired: socket sẽ đóng 4401, onclose gia hạn rồi kết nối lại. error DEPENDENCY_FAILED: server tự thử lại, giữ dữ liệu.
 }
 // Bỏ event trùng eventId; bỏ cập nhật metadata cũ hơn bản đang giữ. revision null (message.created, conversation.read) luôn áp.
 accept(ev:ChatEvent){
  if(this.seen.has(ev.eventId))return false;
  this.seen.add(ev.eventId);this.seenOrder.push(ev.eventId);if(this.seenOrder.length>2000)this.seen.delete(this.seenOrder.shift()!);
  if(ev.revision===null||ev.revision===undefined)return true;
  const known=this.revisions.get(ev.conversationId);if(known!==undefined&&ev.revision<known)return false;
  this.revisions.set(ev.conversationId,ev.revision);return true;
 }
 private retry(immediate=false){
  if(this.stopped)return;this.markDown();this.set('reconnecting');
  const delay=immediate&&this.attempt===0?0:Math.min(30000,1000*2**this.attempt)*(0.5+(this.o.random??Math.random)()/2);this.attempt++;
  clearTimeout(this.retryTimer);this.retryTimer=setTimeout(()=>void this.open(),delay);
 }
}
