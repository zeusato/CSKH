import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { sendMessage } from './api';
import { careBadge,careBanner,unreadLabel } from './care';
import { safeConversation,type ChatEvent,type Conversation } from './contract';
import { clearDrafts,getDraft,setDraft } from './drafts';
import { chatError } from './errors';
import { linkify } from './linkify';
import { ChatRealtime,realtimeUrl } from './realtime';
import { ChatError,ChatSession } from './session';
import { chatAccess,chatAccessForRole } from './access';
import type { Profile } from '../types';
const json=(body:unknown,status=200)=>new Response(body===null?null:JSON.stringify(body),{status});
const grant=(n=1,ms=300000)=>({accessToken:`tok-${n}`,expiresAt:new Date(Date.now()+ms).toISOString(),principal:{id:'p-me',kind:'staff',displayName:'Tôi'},capabilities:{roles:['agent'],queueIds:['support-default'],accountRefs:[]}});
const conv=(more:Partial<Conversation>={}):Conversation=>({id:'c1',kind:'support',accountRef:'058C000001',subject:'Hỗ trợ',status:'open',owner:null,revision:3,unreadCount:2,updatedAt:'2026-10-23T02:00:00Z',syncState:'ready',needsReview:false,capabilities:{canReply:false,canClaim:true,canTransfer:false,canAddNote:false,canResolve:false,canRelease:false,canManageParticipants:false,canJoin:false,canLeave:false,canReopen:false},participants:[],...more});
function session(handler:(url:string,init:RequestInit)=>Response|Promise<Response>){
 let proofs=0;const fetch=vi.fn(async(url:string,init:RequestInit)=>handler(url,init));
 const s=new ChatSession({getProof:async()=>({assertion:`proof-${++proofs}`,gatewayUrl:'http://gw/v1/chat/'}),fetch:fetch as unknown as typeof globalThis.fetch,sleep:async()=>{}});
 return {s,fetch,proofs:()=>proofs};
}
describe('linkify (D27)',()=>{
 it('chỉ http/https thành link, scheme nguy hiểm giữ là chữ',()=>{expect(linkify('xem javascript:alert(1) và data:text/html,x')).toEqual([{text:'xem javascript:alert(1) và data:text/html,x'}]);expect(linkify('<script>alert(1)</script>')).toEqual([{text:'<script>alert(1)</script>'}]);});
 it('tách nhiều URL, bỏ dấu câu dính cuối (kể cả dấu tiếng Việt)',()=>{expect(linkify('Xem https://shs.com.vn/a, rồi http://b.vn/x?y=1… nhé')).toEqual([{text:'Xem '},{text:'https://shs.com.vn/a',href:'https://shs.com.vn/a'},{text:', rồi '},{text:'http://b.vn/x?y=1',href:'http://b.vn/x?y=1'},{text:'… nhé'}]);expect(linkify('(https://a.vn)”')[1]).toEqual({text:'https://a.vn',href:'https://a.vn/'});});
 it('giữ nguyên xuống dòng',()=>{expect(linkify('a\nb')).toEqual([{text:'a\nb'}]);});
});
describe('drafts',()=>{
 beforeEach(clearDrafts);
 it('không lẫn giữa hai principal hoặc hai hội thoại; mặc định Trả lời khách',()=>{setDraft('p1','c1',{text:'nháp',mode:'internal'});expect(getDraft('p2','c1')).toEqual({text:'',mode:'public'});expect(getDraft('p1','c2').mode).toBe('public');expect(getDraft('p1','c1')).toEqual({text:'nháp',mode:'internal'});clearDrafts();expect(getDraft('p1','c1').text).toBe('');});
});
describe('badge người chăm sóc',()=>{
 it('chưa nhận / tôi / người khác / tôi hỗ trợ / đã xong',()=>{
  expect(careBadge(conv(),'p-me').label).toBe('Chưa có người nhận');
  expect(careBadge(conv({owner:{id:'p-me',displayName:'Tôi'}}),'p-me').tone).toBe('mine');
  expect(careBadge(conv({owner:{id:'p2',displayName:'Lan'},participants:[{id:'p3',displayName:'Minh',role:'collaborator',expiresAt:null}]}),'p-me')).toEqual({tone:'other',label:'Đang được Lan chăm sóc',helpers:1,helping:false});
  expect(careBadge(conv({owner:{id:'p2',displayName:'Lan'},participants:[{id:'p-me',displayName:'Tôi',role:'collaborator',expiresAt:null}]}),'p-me').label).toBe('Bạn đang hỗ trợ Lan');
  expect(careBadge(conv({status:'resolved'}),'p-me').tone).toBe('closed');
  expect(careBanner(conv(),'p-me',true).kind).toBe('readonly');expect(unreadLabel(120)).toBe('99+');
 });
});
describe('contract',()=>{
 it('enum lạ → khóa mọi thao tác (fail closed); field lạ được giữ nguyên mà không ảnh hưởng',()=>{const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});const c=safeConversation({...conv({status:'archived' as never}),extra:1} as Conversation);expect(c.unknownState).toBe(true);expect(Object.values(c.capabilities).every(v=>v===false)).toBe(true);warn.mockRestore();});
 it('người hỗ trợ không gồm owner',()=>{expect(safeConversation(conv({owner:{id:'p2',displayName:'Lan'},participants:[{id:'p2',displayName:'Lan',role:'collaborator',expiresAt:null}]})).participants).toEqual([]);});
 it('thiếu cờ capabilities → false',()=>{const c=safeConversation({...conv(),capabilities:{canClaim:true} as never});expect(c.capabilities.canClaim).toBe(true);expect(c.capabilities.canReply).toBe(false);});
});
describe('quyền phía client',()=>{
 const p=(more:Partial<Profile>):Profile=>({id:'u',name:'A',role:'user',active:true,department_id:null,created_at:'',...more});
 it('Admin không mặc nhiên có quyền; viewer chỉ read; tài khoản khóa → none',()=>{expect(chatAccess(p({role:'admin'}))).toBe('none');expect(chatAccess(p({role:'viewer',chat_access:'agent'}))).toBe('none');expect(chatAccess(p({role:'viewer',chat_access:'read'}))).toBe('read');expect(chatAccess(p({chat_access:'agent',active:false}))).toBe('none');expect(chatAccessForRole('viewer','supervisor')).toBe('read');});
});
describe('ChatSession',()=>{
 it('mở phiên bằng assertion mới, chuẩn hóa base URL',async()=>{const {s,fetch}=session(url=>url.endsWith('/sessions')?json(grant(),201):json({}));await s.renew();expect(s.base).toBe('http://gw/v1/chat');expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({proof:'proof-1'}));expect(s.status).toBe('ready');});
 it('nhiều request cùng lúc chỉ gia hạn một lần (single-flight)',async()=>{let n=0;const {s,proofs}=session(url=>url.endsWith('/sessions')?json(grant(++n),201):json({ok:true}));await Promise.all([s.call('GET','/a'),s.call('GET','/b'),s.call('GET','/c')]);expect(proofs()).toBe(1);});
 it('401 → gia hạn một lần rồi thử lại; vẫn 401 thì báo lỗi',async()=>{let n=0,hits=0;const {s,proofs}=session((url,init)=>url.endsWith('/sessions')?json(grant(++n),201):(hits++,(init.headers as Record<string,string>).authorization==='Bearer tok-2'?json({ok:1}):json({code:'UNAUTHENTICATED'},401)));expect(await s.call('GET','/x')).toEqual({ok:1});expect(proofs()).toBe(2);
  const {s:s2}=session(url=>url.endsWith('/sessions')?json(grant(),201):json({code:'UNAUTHENTICATED'},401));await expect(s2.call('GET','/x')).rejects.toMatchObject({status:401});expect(hits).toBe(2);});
 it('403 ở /sessions → dừng hẳn, không lặp',async()=>{const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});const {s,proofs}=session(()=>json({code:'FORBIDDEN'},403));await expect(s.renew()).rejects.toMatchObject({status:403});expect(s.status).toBe('forbidden');expect(proofs()).toBe(1);warn.mockRestore();});
 it('503 retryable → thử lại với assertion mới',async()=>{let n=0;const {s,proofs}=session(()=>++n<3?json({code:'DEPENDENCY_FAILED',retryable:true},503):json(grant(),201));await s.renew();expect(proofs()).toBe(3);});
 it('token sắp hết hạn (<45 giây) thì gia hạn trước khi gọi',async()=>{let n=0;const {s,proofs}=session(url=>url.endsWith('/sessions')?json(grant(++n,n===1?30000:300000),201):json({}));await s.renew();await s.call('GET','/x');expect(proofs()).toBe(2);});
 it('stop → DELETE /sessions/current, sau đó không gia hạn nữa',async()=>{const {s,fetch}=session(url=>url.endsWith('/sessions')?json(grant(),201):json(null,204));await s.renew();await s.stop();expect(fetch.mock.calls.at(-1)![0]).toBe('http://gw/v1/chat/sessions/current');expect(fetch.mock.calls.at(-1)![1].method).toBe('DELETE');await expect(s.renew()).rejects.toBeInstanceOf(ChatError);});
});
class FakeWS{static all:FakeWS[]=[];sent:string[]=[];onopen?:()=>void;onmessage?:(e:{data:string})=>void;onclose?:(e:{code:number})=>void;constructor(public url:string){FakeWS.all.push(this);}send(d:string){this.sent.push(d);}close(){}
 open(){this.onopen?.();}frame(f:object){this.onmessage?.({data:JSON.stringify(f)});}drop(code=1006){this.onclose?.({code});}}
const ev=(eventId:string,type:string,revision:number|null,conversationId='c1'):ChatEvent=>({eventId,type,conversationId,occurredAt:'',revision,cursor:eventId,payload:{}});
describe('ChatRealtime',()=>{
 beforeEach(()=>{vi.useFakeTimers();FakeWS.all=[];});afterEach(()=>vi.useRealTimers());
 async function setup(){
  let tickets=0;const s={base:'https://gw.example/v1/chat',call:vi.fn(async()=>({ticket:`t${++tickets}`})),invalidate:vi.fn()};
  const h={onEvents:vi.fn(),onSync:vi.fn(),onReady:vi.fn(),onStatus:vi.fn(),onForbidden:vi.fn()};
  const rt=new ChatRealtime(s as unknown as ChatSession,h,{WebSocket:FakeWS as unknown as typeof WebSocket,random:()=>1});rt.start();await vi.advanceTimersByTimeAsync(0);
  return {rt,s,h,ws:()=>FakeWS.all.at(-1)!};
 }
 it('URL wss, ticket ở frame auth (không ở URL), chờ ready',async()=>{const {ws,h}=await setup();expect(realtimeUrl('https://gw.example/v1/chat')).toBe('wss://gw.example/v1/chat/realtime');expect(ws().url).toBe('wss://gw.example/v1/chat/realtime');ws().open();expect(JSON.parse(ws().sent[0])).toEqual({type:'auth',ticket:'t1'});expect(h.onReady).not.toHaveBeenCalled();ws().frame({type:'ready',cursor:'c0'});expect(h.onReady).toHaveBeenCalledOnce();});
 it('bỏ eventId trùng và revision cũ; revision null luôn áp',async()=>{const {ws,h,rt}=await setup();ws().open();ws().frame({type:'ready',cursor:'c0'});
  ws().frame({type:'events',cursor:'c1',events:[ev('e1','conversation.updated',5),ev('e1','conversation.updated',5),ev('e2','conversation.updated',4),ev('e3','message.created',null),ev('e4','conversation.read',null)]});
  expect(h.onEvents.mock.calls[0][0].map((e:ChatEvent)=>e.eventId)).toEqual(['e1','e3','e4']);expect(rt.cursor).toBe('c1');});
 it('mất kết nối → backoff có jitter, xin ticket mới và gửi cursor cuối',async()=>{const {ws,s}=await setup();ws().open();ws().frame({type:'ready',cursor:'c9'});ws().drop();expect(s.call).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1000);expect(s.call).toHaveBeenCalledTimes(2);ws().open();expect(JSON.parse(ws().sent[0])).toEqual({type:'auth',ticket:'t2',cursor:'c9'});
  ws().drop();await vi.advanceTimersByTimeAsync(1999);expect(s.call).toHaveBeenCalledTimes(2);await vi.advanceTimersByTimeAsync(1);expect(s.call).toHaveBeenCalledTimes(3);});
 it('đóng 4401 → bỏ token cũ rồi kết nối lại ngay',async()=>{const {ws,s}=await setup();ws().open();ws().frame({type:'ready',cursor:'c0'});ws().frame({type:'session.expired'});ws().drop(4401);expect(s.invalidate).toHaveBeenCalled();await vi.advanceTimersByTimeAsync(0);expect(s.call).toHaveBeenCalledTimes(2);});
 it('đóng 4403 → dừng hẳn, không reconnect',async()=>{const err=vi.spyOn(console,'error').mockImplementation(()=>{});const {ws,s,rt}=await setup();ws().open();ws().drop(4403);await vi.advanceTimersByTimeAsync(60000);expect(s.call).toHaveBeenCalledTimes(1);expect(rt.status).toBe('failed');err.mockRestore();});
 it('socket không trả ready → timeout, thử ticket mới; socket cũ không còn được áp',async()=>{
  const {ws,s,rt,h}=await setup();const old=ws();old.open();await vi.advanceTimersByTimeAsync(15000);expect(rt.status).toBe('offline');
  await vi.advanceTimersByTimeAsync(1000);expect(s.call).toHaveBeenCalledTimes(2);old.frame({type:'ready',cursor:'stale'});expect(h.onReady).not.toHaveBeenCalled();
  ws().open();ws().frame({type:'ready',cursor:'fresh'});expect(rt.cursor).toBe('fresh');await vi.advanceTimersByTimeAsync(15000);expect(s.call).toHaveBeenCalledTimes(2);rt.stop();
 });
 it('ticket request treo → abort và reconnect; stop hủy lần đang chờ',async()=>{
  const signals:AbortSignal[]=[];const s={base:'https://gw',call:vi.fn(async(_m:string,_p:string,_b:unknown,o:{signal:AbortSignal})=>{signals.push(o.signal);return new Promise(()=>{});})};
  const rt=new ChatRealtime(s as unknown as ChatSession,{onEvents:vi.fn(),onSync:vi.fn()},{random:()=>1});rt.start();
  await vi.advanceTimersByTimeAsync(16000);expect(s.call).toHaveBeenCalledTimes(2);expect(signals[0].aborted).toBe(true);rt.stop();expect(signals[1].aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60000);expect(s.call).toHaveBeenCalledTimes(2);
 });
 it('sync.required → tải lại snapshot; mất kết nối >10 giây → offline',async()=>{const {ws,h,rt}=await setup();ws().open();ws().frame({type:'ready',cursor:'c0'});ws().frame({type:'sync.required',cursor:'c5'});expect(h.onSync).toHaveBeenCalled();expect(rt.cursor).toBe('c5');
  ws().drop();expect(rt.status).toBe('reconnecting');await vi.advanceTimersByTimeAsync(10000);expect(rt.status).toBe('offline');});
 it('403 khi xin ticket → dừng và báo mất quyền',async()=>{FakeWS.all=[];const s={base:'https://gw',call:vi.fn(async()=>{throw new ChatError(403,'FORBIDDEN');}),invalidate:vi.fn()};const h={onEvents:vi.fn(),onSync:vi.fn(),onForbidden:vi.fn()};const rt=new ChatRealtime(s as unknown as ChatSession,h,{WebSocket:FakeWS as unknown as typeof WebSocket});rt.start();await vi.advanceTimersByTimeAsync(0);expect(h.onForbidden).toHaveBeenCalled();expect(rt.status).toBe('stopped');expect(FakeWS.all).toEqual([]);});
});
describe('gửi tin và receipt',()=>{
 const msg={id:'m1',conversationId:'c1',clientMessageId:'k1',sender:{id:'p-me',kind:'agent',displayName:'Tôi'},visibility:'public',text:'hi',createdAt:'',status:'accepted',attachments:[]};
 const fake=(responses:Response[])=>{const calls:{url:string;body?:string}[]=[];const s={call:vi.fn(async(method:string,url:string,body?:unknown)=>{calls.push({url,body:body===undefined?undefined:JSON.stringify(body)});const r=responses.shift()!;if(!r.ok)throw await ChatError.from(r);return r.json();})};return {s:s as unknown as ChatSession,calls};};
 const input={clientMessageId:'k1',text:'hi',visibility:'public' as const};
 it('201 → sent',async()=>{const {s}=fake([json(msg,201)]);expect(await sendMessage(s,'c1',input,{sleep:async()=>{}})).toEqual({kind:'sent',message:msg});});
 it('202 processing → tra lại receipt tới accepted',async()=>{const {s,calls}=fake([json({clientMessageId:'k1',conversationId:'c1',status:'processing',messageId:null},202),json({clientMessageId:'k1',conversationId:'c1',status:'processing',messageId:null}),json({clientMessageId:'k1',conversationId:'c1',status:'accepted',messageId:'m1'})]);expect(await sendMessage(s,'c1',input,{sleep:async()=>{}})).toEqual({kind:'accepted',messageId:'m1'});expect(calls[1].url).toBe('/message-requests/k1?conversationId=c1');});
 it('unknown → không tự gửi lại; rejected → báo rejected',async()=>{const a=fake([json({clientMessageId:'k1',conversationId:'c1',status:'unknown',messageId:null},202)]);expect(await sendMessage(a.s,'c1',input,{sleep:async()=>{}})).toEqual({kind:'unknown'});expect(a.calls).toHaveLength(1);const b=fake([json({clientMessageId:'k1',conversationId:'c1',status:'rejected',messageId:null},202)]);expect((await sendMessage(b.s,'c1',input,{sleep:async()=>{}})).kind).toBe('rejected');});
 it('mạng rớt → gửi lại đúng clientMessageId và nội dung',async()=>{let n=0;const bodies:string[]=[];const s={call:vi.fn(async(_m:string,_u:string,body:unknown)=>{bodies.push(JSON.stringify(body));if(++n===1)throw new TypeError('fetch failed');return msg;})} as unknown as ChatSession;expect((await sendMessage(s,'c1',input,{sleep:async()=>{}})).kind).toBe('sent');expect(bodies[0]).toBe(bodies[1]);});
 it('409/403 không tự thử lại và ánh xạ thông báo tiếng Việt',async()=>{const {s,calls}=fake([json({code:'CONVERSATION_RESOLVED',correlationId:'cid-1'},409)]);const e=await sendMessage(s,'c1',input,{sleep:async()=>{}}).catch(x=>x);expect(calls).toHaveLength(1);expect(chatError(e)).toEqual({message:'Hội thoại đã kết thúc.',action:'refetch',code:'CONVERSATION_RESOLVED',correlationId:'cid-1'});expect(chatError(new ChatError(500,'SOMETHING_NEW')).message).toBe('Không thực hiện được, thử lại sau.');});
});
