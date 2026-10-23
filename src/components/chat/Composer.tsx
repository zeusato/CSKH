import { useEffect,useLayoutEffect,useRef,useState,type KeyboardEvent } from 'react';
import { Send,LoaderCircle,TriangleAlert,RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { sendMessage } from '../../lib/chat/api';
import { codePoints,LIMITS,type Conversation } from '../../lib/chat/contract';
import { getDraft,setDraft,type Draft } from '../../lib/chat/drafts';
import { chatError } from '../../lib/chat/errors';
import { useChat } from '../../lib/chat/provider';
import { Button } from '../ui';
type Pending={clientMessageId:string;text:string;state:'sending'|'unknown'};
export function composerBlock(c:Conversation,mode:Draft['mode']):string|null{
 if(c.unknownState)return 'Trạng thái hội thoại chưa được hỗ trợ.';
 if(c.syncState==='pending')return 'Đang khởi tạo hội thoại…';
 if(c.syncState==='failed')return 'Hội thoại chưa đồng bộ được với máy chủ chat.';
 if(mode==='internal')return c.capabilities.canAddNote?null:c.status==='resolved'?'Hội thoại đã kết thúc.':'Nhận xử lý hoặc Tham gia hỗ trợ để ghi chú.';
 if(c.capabilities.canReply)return null;
 return c.status==='resolved'?(c.capabilities.canReopen?'Hội thoại đã kết thúc. Mở lại để trả lời khách.':'Hội thoại đã kết thúc.'):'Nhận xử lý hoặc Tham gia hỗ trợ để trả lời khách.';
}
export function Composer({c,onSent}:{c:Conversation;onSent:()=>void}){
 const {session,principalId}=useChat();
 // Mở hội thoại luôn ở chế độ Trả lời khách, trừ khi draft đang dở ở chế độ ghi chú.
 const [draft,setLocal]=useState<Draft>(()=>getDraft(principalId,c.id));const [pending,setPending]=useState<Pending[]>([]);const sending=pending.some(p=>p.state==='sending');
 const area=useRef<HTMLTextAreaElement>(null);
 // Start with one line; grow only as needed, keeping room for message history.
 useLayoutEffect(()=>{
  const el=area.current;if(!el)return;
  const resize=()=>{el.style.height='0px';el.style.height=`${el.scrollHeight+2}px`;};
  resize();const parent=el.parentElement;let width=parent?.clientWidth;
  const observer=new ResizeObserver(()=>{if(parent&&parent.clientWidth!==width){width=parent.clientWidth;resize();}});if(parent)observer.observe(parent);
  return ()=>observer.disconnect();
 },[draft.text]);
 useEffect(()=>{setLocal(getDraft(principalId,c.id));setPending([]);},[principalId,c.id]);
 const update=(d:Draft)=>{setLocal(d);setDraft(principalId,c.id,d);};
 const block=composerBlock(c,draft.mode);const length=codePoints(draft.text);const tooLong=length>LIMITS.textMaxChars;const empty=!draft.text.trim();
 async function send(){
  if(block||empty||tooLong||sending||!session)return;
  // clientMessageId sinh một lần cho mỗi tin; khóa nút trong lúc gửi để double-click không tạo hai id.
  const item:Pending={clientMessageId:crypto.randomUUID(),text:draft.text,state:'sending'};const visibility=draft.mode;
  setPending(p=>[...p,item]);update({text:'',mode:draft.mode});
  try{
   const r=await sendMessage(session,c.id,{clientMessageId:item.clientMessageId,text:item.text,visibility});
   if(r.kind==='sent'||r.kind==='accepted'){setPending(p=>p.filter(x=>x.clientMessageId!==item.clientMessageId));onSent();}
   else if(r.kind==='unknown')setPending(p=>p.map(x=>x.clientMessageId===item.clientMessageId?{...x,state:'unknown'}:x));
   else{setPending(p=>p.filter(x=>x.clientMessageId!==item.clientMessageId));restore(item.text,visibility);toast.error('Tin không gửi được. Nội dung đã được trả lại ô soạn để bạn sửa và gửi lại.');}
  }catch(e){
   setPending(p=>p.filter(x=>x.clientMessageId!==item.clientMessageId));restore(item.text,visibility);
   const err=chatError(e);toast.error(err.message,{description:err.correlationId?`Mã tra cứu: ${err.correlationId}`:undefined});if(err.action==='refetch'||err.action==='retry')onSent();
  }
 }
 function restore(text:string,mode:Draft['mode']){const current=getDraft(principalId,c.id);update({text:current.text?`${text}\n${current.text}`:text,mode});area.current?.focus();}
 function key(e:KeyboardEvent<HTMLTextAreaElement>){if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}
 return <div className={`chat-composer ${draft.mode==='internal'?'is-internal':''}`}>
  {pending.length>0&&<ul className="chat-pending" aria-live="polite">{pending.map(p=><li key={p.clientMessageId}>{p.state==='sending'?<><LoaderCircle size={14} className="spin"/>Đang gửi…</>:<><TriangleAlert size={14}/>Chưa xác định được đã gửi — kiểm tra lịch sử trước khi gửi lại.<button type="button" className="text-button" onClick={()=>{setPending(x=>x.filter(i=>i.clientMessageId!==p.clientMessageId));onSent();}}><RefreshCw size={14}/>Tải lại lịch sử</button></>}<span className="chat-pending-text">{p.text}</span></li>)}</ul>}
  <div className="chat-mode" role="radiogroup" aria-label="Loại tin">
   <button type="button" role="radio" aria-checked={draft.mode==='public'} onClick={()=>update({...draft,mode:'public'})}>Trả lời khách</button>
   <button type="button" role="radio" aria-checked={draft.mode==='internal'} onClick={()=>update({...draft,mode:'internal'})}>Ghi chú nội bộ</button>
  </div>
  <textarea ref={area} rows={1} value={draft.text} disabled={Boolean(block)} aria-label={draft.mode==='internal'?'Ghi chú nội bộ':'Trả lời khách'} aria-invalid={tooLong} placeholder={(draft.mode==='internal'?'Ghi chú cho đồng nghiệp — khách không thấy':'Nhập tin trả lời khách…')} onChange={e=>update({...draft,text:e.target.value})} onKeyDown={key}/>
  <div className="chat-composer-foot">
   <small className="muted">{draft.mode==='internal'?'Chỉ nhân viên CSKH thấy ghi chú này.':'Khách sẽ thấy tên: CSKH SHS'}<span className="chat-key-hint"> · Enter gửi · Shift+Enter xuống dòng</span></small>
   <small className={tooLong?'danger-text':'muted'}>{length.toLocaleString('vi-VN')}/{LIMITS.textMaxChars.toLocaleString('vi-VN')}</small>
   <Button onClick={()=>void send()} disabled={Boolean(block)||empty||tooLong||sending}><Send size={17}/>{draft.mode==='internal'?'Lưu ghi chú':'Gửi'}</Button>
  </div>
  {block&&<p className="chat-composer-block" role="status">{block}</p>}
 </div>;
}
