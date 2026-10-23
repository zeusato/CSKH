import { useEffect,useRef,useState } from 'react';
import { HandHelping,UserPlus,LogOut,ArrowRightLeft,Undo2,Clock,CircleCheck,RotateCcw,Eye,X,MoreHorizontal } from 'lucide-react';
import type { Action } from '../../lib/chat/api';
import { careBanner } from '../../lib/chat/care';
import type { Conversation } from '../../lib/chat/contract';
import { Button,Modal } from '../ui';
// Mỗi nút chỉ hiện khi cờ capabilities tương ứng là true; không tự suy quyền từ vai trò (CHAT-PLAN §5.4).
export function CareBanner({c,principalId,readOnly,busy,onAction,onPick}:{c:Conversation;principalId:string;readOnly:boolean;busy:boolean;onAction:(a:Action)=>void;onPick:(mode:'transfer'|'add')=>void}){
 const banner=careBanner(c,principalId,readOnly);const cap=c.capabilities;const [confirm,setConfirm]=useState(false);
 const helpers=c.participants||[];
 const menu=useRef<HTMLDetailsElement>(null);
 const hasMore=cap.canManageParticipants||(cap.canResolve&&c.status==='open')||cap.canRelease||cap.canLeave;
 useEffect(()=>{
  const close=(e:PointerEvent)=>{if(menu.current&&!menu.current.contains(e.target as Node))menu.current.open=false;};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape'&&menu.current?.open){menu.current.open=false;menu.current.querySelector('summary')?.focus();e.stopPropagation();}};
  document.addEventListener('pointerdown',close);document.addEventListener('keydown',escape);
  return ()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',escape);};
 },[]);
 return <div className={`chat-banner chat-banner-${banner.kind}`}>
  <div className="chat-banner-text">{readOnly&&<Eye size={17}/>}<strong>{banner.text}</strong>{c.unknownState&&<span className="chat-banner-note">Trạng thái hội thoại chưa được hỗ trợ, các thao tác bị khóa.</span>}</div>
  {(c.owner||helpers.length>0)&&<div className="chat-people" aria-label="Người chăm sóc">{c.owner&&<span className="chat-person chat-person-owner">Phụ trách: {c.owner.id===principalId?'Bạn':c.owner.displayName}</span>}{helpers.map(p=><span key={p.id} className="chat-person">Hỗ trợ: {p.id===principalId?'Bạn':p.displayName}{cap.canManageParticipants&&p.id!==principalId&&<button type="button" className="icon-plain" disabled={busy} aria-label={`Gỡ ${p.displayName} khỏi người hỗ trợ`} onClick={()=>onAction({kind:'removeParticipant',principalId:p.id})}><X size={13}/></button>}</span>)}</div>}
  {!readOnly&&<div className="chat-banner-actions">
   {cap.canClaim&&<Button disabled={busy} onClick={()=>onAction({kind:'claim'})}><HandHelping size={17}/>Nhận xử lý</Button>}
   {cap.canJoin&&<Button variant="secondary" disabled={busy} onClick={()=>onAction({kind:'join'})}><UserPlus size={17}/>Tham gia hỗ trợ</Button>}
   {cap.canTransfer&&<Button variant="secondary" disabled={busy} aria-label="Chuyển cho đồng nghiệp" title="Chuyển cho đồng nghiệp" onClick={()=>onPick('transfer')}><ArrowRightLeft size={17}/>Chuyển</Button>}
   {cap.canResolve&&c.status!=='resolved'&&<Button variant="secondary" disabled={busy} onClick={()=>setConfirm(true)}><CircleCheck size={17}/>Đóng hội thoại</Button>}
   {cap.canReopen&&<Button variant="secondary" disabled={busy} onClick={()=>onAction({kind:'status',status:'open'})}><RotateCcw size={17}/>Mở lại</Button>}
   {hasMore&&<details className="chat-action-menu" ref={menu}><summary aria-label="Thao tác khác" title="Thao tác khác"><MoreHorizontal size={19}/><span>Thêm</span></summary><div className="chat-action-popover" onClick={e=>{if((e.target as HTMLElement).closest('button:not(:disabled)')&&menu.current)menu.current.open=false;}}>
    {cap.canManageParticipants&&<Button variant="ghost" disabled={busy} onClick={()=>onPick('add')}><UserPlus size={17}/>Thêm người hỗ trợ</Button>}
    {cap.canResolve&&c.status==='open'&&<Button variant="ghost" disabled={busy} onClick={()=>onAction({kind:'status',status:'pending_customer'})}><Clock size={17}/>Chờ khách phản hồi</Button>}
    {cap.canRelease&&<Button variant="ghost" disabled={busy} onClick={()=>onAction({kind:'release'})}><Undo2 size={17}/>Trả lại pool</Button>}
    {cap.canLeave&&<Button variant="ghost" disabled={busy} onClick={()=>onAction({kind:'leave'})}><LogOut size={17}/>Rời hỗ trợ</Button>}
   </div></details>}
  </div>}
  <Modal open={confirm} onClose={()=>setConfirm(false)} title="Đóng hội thoại?" description="Khách không nhắn tiếp được vào hội thoại đã đóng; nếu cần, khách tạo yêu cầu mới. Người phụ trách hoặc giám sát vẫn mở lại được."><div className="modal-actions"><Button variant="secondary" onClick={()=>setConfirm(false)}>Chưa đóng</Button><Button onClick={()=>{setConfirm(false);onAction({kind:'status',status:'resolved'});}}>Đóng hội thoại</Button></div></Modal>
 </div>;
}
