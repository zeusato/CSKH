// Một phiên Chat + một WebSocket cho cả ứng dụng khi người dùng có quyền Chat (badge chưa đọc trên menu cần dữ liệu ngoài trang /chat).
import { createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode } from 'react';
import { infiniteQueryOptions,useInfiniteQuery,useQueryClient,type QueryClient } from '@tanstack/react-query';
import { FunctionsFetchError,FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import type { Profile } from '../types';
import { chatAccess,type ChatAccess } from './access';
import { listQueue,type QueueTab } from './api';
import type { ChatEvent } from './contract';
import { clearDrafts } from './drafts';
import { ChatRealtime,type RealtimeStatus } from './realtime';
import { ChatError,ChatSession,type Proof,type SessionStatus } from './session';
type ChatValue={session:ChatSession|null;access:ChatAccess;status:SessionStatus;realtime:RealtimeStatus;ready:boolean;principalId:string;readOnly:boolean;unread:number;sound:boolean;setSound:(v:boolean)=>void;retry:()=>void};
const ChatContext=createContext<ChatValue|null>(null);
export const isChatKey=(key:unknown)=>/^chat-/.test(String(key));
export const queueOptions=(session:ChatSession|null,tab:QueueTab,accountRef:string,enabled:boolean)=>infiniteQueryOptions({
 queryKey:['chat-queue',tab,accountRef],queryFn:({pageParam})=>listQueue(session!,tab,accountRef,pageParam),initialPageParam:null as string|null,getNextPageParam:p=>p.nextCursor,enabled:enabled&&Boolean(session),
});
// Mỗi lần mở/gia hạn phiên lấy assertion mới; Supabase SDK tự gắn access token hiện tại.
async function getProof():Promise<Proof>{
 const {data,error}=await supabase.functions.invoke('chat-session',{body:{}});
 if(error instanceof FunctionsHttpError){const status=(error.context as Response).status;throw new ChatError(status,status===403?'FORBIDDEN':status===401?'UNAUTHENTICATED':'DEPENDENCY_FAILED',status>=500);}
 if(error instanceof FunctionsFetchError)throw new TypeError('fetch failed');
 if(error||!data?.assertion)throw new ChatError(500,'INTERNAL',true);
 return data as Proof;
}
function readSound(){try{return localStorage.getItem('cskh-chat-sound')!=='off';}catch{return true;}}
function beep(){try{const ctx=new AudioContext(),o=ctx.createOscillator(),g=ctx.createGain();o.frequency.value=880;g.gain.setValueAtTime(0.08,ctx.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+0.25);o.connect(g).connect(ctx.destination);o.start();o.stop(ctx.currentTime+0.25);o.onended=()=>void ctx.close();}catch{/* Trình duyệt chặn âm thanh */}}
// Gom invalidate theo ~200 ms để một loạt event không gây hàng chục lần refetch.
function eventBatcher(cache:QueryClient,onNew:()=>void){
 let messages=new Set<string>(),conversations=new Set<string>(),lists=false,timer:ReturnType<typeof setTimeout>|undefined;
 const flush=()=>{timer=undefined;const m=messages,c=conversations,l=lists;messages=new Set();conversations=new Set();lists=false;
  m.forEach(id=>void cache.invalidateQueries({queryKey:['chat-messages',id]}));c.forEach(id=>void cache.invalidateQueries({queryKey:['chat-conversation',id]}));if(l)void cache.invalidateQueries({queryKey:['chat-queue']});};
 return {add(events:ChatEvent[]){for(const ev of events){
   if(ev.type==='message.created'){messages.add(ev.conversationId);conversations.add(ev.conversationId);lists=true;}
   else if(ev.type==='conversation.created'){lists=true;onNew();}
   else if(['conversation.updated','conversation.assigned','conversation.read'].includes(ev.type)){conversations.add(ev.conversationId);lists=true;}
  }timer??=setTimeout(flush,200);},stop(){clearTimeout(timer);}};
}
export function ChatProvider({profile,enabled:moduleOn=true,children}:{profile:Profile|null;enabled?:boolean;children:ReactNode}){
 // Tắt cờ phân hệ hoặc gỡ quyền: effect dọn dẹp thu hồi phiên Gateway, đóng socket, xóa draft và cache.
 const cache=useQueryClient();const access=chatAccess(profile);const enabled=moduleOn&&access!=='none';
 const [session,setSession]=useState<ChatSession|null>(null);const [status,setStatus]=useState<SessionStatus>('connecting');const [realtime,setRealtime]=useState<RealtimeStatus>('connecting');
 const [ready,setReady]=useState(false);const [principalId,setPrincipalId]=useState('');const [sound,setSoundState]=useState(readSound);const [attempt,setAttempt]=useState(0);
 const soundRef=useRef(sound);soundRef.current=sound;
 useEffect(()=>{
  if(!enabled||!profile)return;
  const s=new ChatSession({getProof});let realtimeClient:ChatRealtime|null=null;let fallback:ReturnType<typeof setTimeout>|undefined;let alive=true;
  const forbidden=()=>{if(!alive)return;setStatus('forbidden');realtimeClient?.stop();cache.removeQueries({predicate:q=>isChatKey(q.queryKey[0])});clearDrafts();};
  const batch=eventBatcher(cache,()=>{if(soundRef.current&&document.visibilityState==='visible')beep();});
  setSession(s);setStatus('connecting');setRealtime('connecting');setReady(false);
  const unsubscribe=s.subscribe(()=>{if(!alive)return;setStatus(s.status);if(s.status==='forbidden')forbidden();if(s.grant)setPrincipalId(s.grant.principal.id);});
  void s.renew().then(()=>{
   if(!alive)return;
   // Không mất tin lúc khởi động: mở socket và chờ `ready` trước rồi mới bật query; event đến trong lúc tải sẽ invalidate và tải lại.
   realtimeClient=new ChatRealtime(s,{onEvents:batch.add,onSync:()=>void cache.invalidateQueries({predicate:q=>isChatKey(q.queryKey[0])}),onReady:()=>setReady(true),onStatus:setRealtime,onForbidden:forbidden});
   realtimeClient.start();
   // Socket không lên được thì vẫn tải dữ liệu qua HTTP sau 8 giây; chip mất kết nối báo cho người dùng.
   fallback=setTimeout(()=>{if(alive)setReady(true);},8000);
  }).catch(()=>{});
  return ()=>{alive=false;clearTimeout(fallback);batch.stop();unsubscribe();realtimeClient?.stop();void s.stop();clearDrafts();cache.removeQueries({predicate:q=>isChatKey(q.queryKey[0])});setSession(null);setReady(false);setPrincipalId('');};
 },[enabled,profile?.id,access,cache,attempt]);
 const live=enabled&&status==='ready'&&ready;
 const mine=useInfiniteQuery(queueOptions(session,'mine','',live&&access!=='read'));const unclaimed=useInfiniteQuery(queueOptions(session,'unclaimed','',live&&access!=='read'));
 // Tổng unreadCount của các dòng đã tải ở Của tôi + Chưa nhận (Gateway không có API đếm). Quyền chỉ xem không có badge.
 const unread=access==='read'?0:[...[mine.data,unclaimed.data].flatMap(d=>d?.pages.flatMap(p=>p.items)??[]).reduce((ids,c)=>ids.set(c.id,c.unreadCount),new Map<string,number>()).values()].reduce((a,b)=>a+b,0);
 useEffect(()=>{const base=document.title.replace(/^\(\d+\+?\) /,'');document.title=unread?`(${unread>99?'99+':unread}) ${base}`:base;},[unread]);
 const value=useMemo<ChatValue>(()=>({session,access,status:enabled?status:'stopped',realtime,ready:live,principalId,readOnly:access==='read',unread,sound,setSound:(v:boolean)=>{setSoundState(v);try{localStorage.setItem('cskh-chat-sound',v?'on':'off');}catch{/* Preference là tùy chọn */}},retry:()=>setAttempt(n=>n+1)}),[session,access,status,enabled,realtime,live,principalId,unread,sound]);
 return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}
export function useChat(){const v=useContext(ChatContext);if(!v)throw new Error('ChatProvider missing');return v;}
