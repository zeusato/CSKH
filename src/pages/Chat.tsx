import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { MessagesSquare,PanelLeftClose,PanelLeftOpen } from 'lucide-react';
import { useChat } from '../lib/chat/provider';
import { Button,EmptyState,ErrorState,Loading } from '../components/ui';
import { ConnectionState } from '../components/chat/ConnectionState';
import { QueuePanel } from '../components/chat/QueuePanel';
import { ThreadView } from '../components/chat/ThreadView';
export default function Chat(){
 const {status,readOnly,retry}=useChat();const {conversationId}=useParams();
 const [poolCollapsed,setPoolCollapsed]=useState(false);
 const body=status==='forbidden'?<EmptyState title="Bạn chưa được cấp quyền Chat hoặc quyền vừa bị thu hồi" description="Liên hệ quản trị viên CSKH nếu bạn cần dùng phân hệ này."/>:
  status==='error'?<ErrorState message="Chưa kết nối được máy chủ chat. Kiểm tra mạng rồi thử lại." onRetry={retry}/>:
  status==='connecting'?<Loading label="Đang kết nối máy chủ chat…"/>:
  <div className={`chat-layout ${conversationId?'has-thread':''} ${poolCollapsed&&conversationId?'pool-collapsed':''}`}><QueuePanel activeId={conversationId}/>{conversationId?<ThreadView key={conversationId} id={conversationId}/>:<section className="chat-thread chat-thread-empty"><EmptyState title="Chọn một hội thoại" description={readOnly?'Bạn đang xem ở chế độ chỉ đọc.':'Nhận khách ở mục Chưa nhận, hoặc mở hội thoại của bạn để tiếp tục.'}/></section>}</div>;
 return <div className="chat-page">
  <header className="chat-heading"><div className="chat-heading-title">{status==='ready'&&conversationId&&<Button variant="ghost" className="icon-button chat-pool-toggle" aria-label={poolCollapsed?'Hiện danh sách hội thoại':'Ẩn danh sách hội thoại'} aria-expanded={!poolCollapsed} onClick={()=>setPoolCollapsed(v=>!v)}>{poolCollapsed?<PanelLeftOpen size={19}/>:<PanelLeftClose size={19}/>}</Button>}<h1><MessagesSquare size={19} aria-hidden="true"/>Chat khách hàng</h1></div>{status==='ready'?<ConnectionState/>:status==='error'?<Button variant="secondary" onClick={retry}>Kết nối lại</Button>:null}</header>
  {body}
 </div>;
}
