import { useEffect,useLayoutEffect,useMemo,useRef,useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery,useQueryClient,type UseQueryResult } from '@tanstack/react-query';
import { ArrowLeft,RefreshCw,TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { act,getConversation,listMessages,markRead,type Action } from '../../lib/chat/api';
import type { Conversation,Message,Page } from '../../lib/chat/contract';
import { refreshChatQueries } from '../../lib/chat/cache';
import { appendOlder,messageKey,messageOptions } from '../../lib/chat/messages';
import { chatError } from '../../lib/chat/errors';
import { useChat } from '../../lib/chat/provider';
import { ChatError } from '../../lib/chat/session';
import { Button,EmptyState,ErrorState,Loading } from '../ui';
import { CareBanner } from './CareBanner';
import { Composer } from './Composer';
import { MessageItem } from './MessageItem';
import { TransferDialog } from './TransferDialog';
const statusLabels:Record<string,string>={open:'Đang xử lý',pending_customer:'Chờ khách',resolved:'Đã xong'};
export function ThreadView({id}:{id:string}){
 const {session,ready,principalId,readOnly}=useChat();const cache=useQueryClient();const navigate=useNavigate();
 const [busy,setBusy]=useState(false);const [pick,setPick]=useState<'transfer'|'add'|null>(null);
 // syncState pending: đọc lại theo nhịp 1 → 2 → 4 giây, tối đa khoảng 30 giây.
 const conversation=useQuery({queryKey:['chat-conversation',id],queryFn:()=>getConversation(session!,id),enabled:ready&&Boolean(session),
  refetchInterval:q=>q.state.data?.syncState==='pending'&&q.state.dataUpdateCount<8?Math.min(4000,1000*2**Math.max(0,q.state.dataUpdateCount-1)):false});
 // Start history alongside metadata, instead of waiting for the detail response.
 const messages=useQuery(messageOptions(session,id,cache,ready));
 const refresh=()=>{refreshChatQueries(cache,{queryKey:['chat-conversation',id]});refreshChatQueries(cache,{queryKey:messageKey(id)});refreshChatQueries(cache,{queryKey:['chat-queue']});};
 const sent=(hasMessage=false)=>{if(!hasMessage)refreshChatQueries(cache,{queryKey:messageKey(id)});refreshChatQueries(cache,{queryKey:['chat-queue']});};
 const notFound=conversation.error instanceof ChatError&&conversation.error.code==='NOT_FOUND';
 async function run(a:Action){
  const c=conversation.data;if(!c||!session)return;setBusy(true);
  try{const next=await act(session,c,a);cache.setQueryData(['chat-conversation',id],next);void cache.invalidateQueries({queryKey:['chat-queue']});setPick(null);
   if(a.kind==='transfer')toast.success(`Đã chuyển cho ${next.owner?.displayName||'đồng nghiệp'}`);else if(a.kind==='claim')toast.success('Bạn đã nhận xử lý khách này');}
  catch(e){
   const err=chatError(e);
   // Nhận đồng thời: người thua thấy toast trung tính và gợi ý Tham gia hỗ trợ, không báo lỗi đỏ.
   if(err.code==='ALREADY_CLAIMED'||err.code==='REVISION_CONFLICT')toast.info(err.message);else toast.error(err.message,{description:err.correlationId?`Mã tra cứu: ${err.correlationId}`:undefined});
   if(err.action==='remove'){cache.removeQueries({queryKey:['chat-conversation',id]});void cache.invalidateQueries({queryKey:['chat-queue']});navigate('/chat');}else refresh();
  }finally{setBusy(false);}
 }
 if(!ready||conversation.isPending)return <section className="chat-thread"><Loading label="Đang mở hội thoại…"/></section>;
 if(notFound)return <section className="chat-thread"><EmptyState title="Hội thoại không còn trong phạm vi của bạn" description="Hội thoại có thể đã bị chuyển khỏi pool hoặc bạn không còn quyền xem." action={<Button variant="secondary" onClick={()=>navigate('/chat')}>Về danh sách</Button>}/></section>;
 if(conversation.error&&(!conversation.data||conversation.error instanceof ChatError&&conversation.error.status===403))return <section className="chat-thread"><ErrorState message={chatError(conversation.error).message} onRetry={()=>conversation.refetch()}/></section>;
 const c=conversation.data;
 return <section className="chat-thread" aria-label={`Hội thoại với ${c.customer?.displayName||'khách hàng'}`}>
  <header className="chat-thread-head">
   <Button variant="ghost" className="icon-button chat-back" aria-label="Quay lại danh sách" onClick={()=>navigate('/chat')}><ArrowLeft size={20}/></Button>
   <div className="chat-thread-title"><h2 title={c.customer?.displayName||'Khách hàng'}>{c.customer?.displayName||'Khách hàng'}</h2><p><span className="chat-account">STK {c.accountRef}</span><span title={c.subject}>{c.subject}</span></p></div>
   <span className={`chat-status chat-status-${c.status}`}>{statusLabels[c.status]||'Không rõ'}</span>
  </header>
  {c.syncState==='failed'&&<div className="chat-alert chat-alert-danger" role="alert"><TriangleAlert size={17}/>Hội thoại chưa đồng bộ được với máy chủ chat.<Button variant="ghost" onClick={refresh}><RefreshCw size={15}/>Tải lại</Button></div>}
  {c.needsReview&&<div className="chat-alert" role="status"><TriangleAlert size={17}/>Hội thoại bị thay đổi ngoài Gateway, cần kiểm tra lại lịch sử.</div>}
  <CareBanner c={c} principalId={principalId} readOnly={readOnly} busy={busy} onAction={a=>void run(a)} onPick={setPick}/>
  <MessageList c={c} messages={messages}/>
  {/* Chế độ chỉ đọc ẩn hẳn composer, không chỉ disable. */}
  {!readOnly&&<Composer c={c} onSent={sent} onRefresh={refresh}/>}
  {pick&&<TransferDialog open mode={pick} conversation={c} onClose={()=>setPick(null)} onSubmit={async(target,reason)=>run(pick==='transfer'?{kind:'transfer',targetPrincipalId:target,reason:reason||undefined}:{kind:'addParticipant',principalId:target})}/>}
 </section>;
}
function MessageList({c,messages}:{c:Conversation;messages:UseQueryResult<Page<Message>,Error>}){
 const {session,principalId,readOnly}=useChat();const cache=useQueryClient();
 const items=useMemo(()=>[...(messages.data?.items??[])].reverse(),[messages.data]);
 const [loadingOlder,setLoadingOlder]=useState(false),[olderError,setOlderError]=useState(false);
 const olderRequest=useRef<AbortController|null>(null);const hasMore=Boolean(messages.data?.nextCursor);
 useEffect(()=>()=>olderRequest.current?.abort(),[]);
 const box=useRef<HTMLDivElement>(null);const bottom=useRef<HTMLLIElement>(null);const anchor=useRef<{height:number;top:number}|null>(null);const stick=useRef(true);const lastRead=useRef('');
 const last=items[items.length-1]?.id;
 async function loadOlder(){
  const cursor=messages.data?.nextCursor;if(!cursor||!session||olderRequest.current)return;
  const controller=new AbortController();olderRequest.current=controller;setLoadingOlder(true);setOlderError(false);
  try{const page=await listMessages(session,c.id,cursor,controller.signal);if(!controller.signal.aborted){const el=box.current;if(el)anchor.current={height:el.scrollHeight,top:el.scrollTop};appendOlder(cache,c.id,cursor,page);}}
  catch{if(!controller.signal.aborted){anchor.current=null;setOlderError(true);}}
  finally{if(!controller.signal.aborted){olderRequest.current=null;setLoadingOlder(false);}}
 }
 useLayoutEffect(()=>{const el=box.current;if(!el)return;
  // Giữ vị trí cuộn khi chèn tin cũ lên đầu; tự cuộn xuống khi đang ở cuối và có tin mới.
  if(anchor.current){el.scrollTop=anchor.current.top+(el.scrollHeight-anchor.current.height);anchor.current=null;}else if(stick.current)el.scrollTop=el.scrollHeight;
 },[items.length,last,loadingOlder]);
 useEffect(()=>{stick.current=true;lastRead.current='';},[c.id]);
 // Keep the latest message visible when the composer grows or the viewport changes.
 useEffect(()=>{const el=box.current;if(!el)return;const observer=new ResizeObserver(()=>{if(stick.current)el.scrollTop=el.scrollHeight;});observer.observe(el);return()=>observer.disconnect();},[]);
 function scroll(){const el=box.current;if(!el)return;stick.current=el.scrollHeight-el.scrollTop-el.clientHeight<80;
  if(el.scrollTop<60&&hasMore&&!olderError)void loadOlder();}
 // Chỉ đánh dấu đã đọc khi tab đang hiển thị và tin cuối thực sự nằm trong vùng nhìn thấy. Mốc đọc chỉ tăng.
 useEffect(()=>{
  const el=bottom.current;if(!el||!last||readOnly||!session)return;
  const tryRead=()=>{if(document.visibilityState!=='visible'||lastRead.current===last)return;lastRead.current=last;void markRead(session,c.id,last).then(()=>{refreshChatQueries(cache,{queryKey:['chat-queue']});}).catch(()=>{lastRead.current='';});};
  let visible=false;const io=new IntersectionObserver(([e])=>{visible=e.isIntersecting;if(visible)tryRead();},{root:box.current,threshold:0.6});io.observe(el);
  const onVisible=()=>{if(visible)tryRead();};document.addEventListener('visibilitychange',onVisible);
  return ()=>{io.disconnect();document.removeEventListener('visibilitychange',onVisible);};
 },[last,c.id,readOnly,session,cache]);
 return <div className="chat-messages" ref={box} onScroll={scroll} tabIndex={0} aria-label="Lịch sử tin nhắn">
  {messages.isPending?<Loading label="Đang tải tin nhắn…"/>:messages.error&&(!messages.data||messages.error instanceof ChatError&&[403,404].includes(messages.error.status))?<ErrorState message={chatError(messages.error).message} onRetry={()=>messages.refetch()}/>:<>
   {messages.error&&<div role="status">Chưa cập nhật được tin mới. <button className="text-button" onClick={()=>void messages.refetch()}>Thử lại</button></div>}
   <div className="chat-history-top">{hasMore?<Button variant="ghost" loading={loadingOlder} onClick={()=>void loadOlder()}>{olderError?'Thử tải lại tin cũ':'Tải tin cũ hơn'}</Button>:items.length?<small className="muted">Đầu hội thoại</small>:null}</div>
   {!items.length?<EmptyState title="Chưa có tin nhắn" description="Tin của khách sẽ hiện ở đây."/>:<ol>{items.map(m=><MessageItem key={m.id} message={m} mine={m.sender.id===principalId}/>)}<li ref={bottom} className="chat-bottom" aria-hidden="true"/></ol>}
  </>}
 </div>;
}
