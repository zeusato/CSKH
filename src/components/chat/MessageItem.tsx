import { memo } from 'react';
import type { Message } from '../../lib/chat/contract';
import { linkify } from '../../lib/chat/linkify';
import { formatDate } from '../../lib/utils';
// Text node + pre-wrap; chỉ URL http/https thành link, hiển thị đúng URL thật (D27). Không dùng dangerouslySetInnerHTML.
export function MessageText({text}:{text:string}){return <span className="chat-text">{linkify(text).map((p,i)=>p.href?<a key={i} href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a>:p.text)}</span>;}
export const MessageItem=memo(function MessageItem({message,mine}:{message:Message;mine:boolean}){
 const internal=message.visibility==='internal',customer=message.sender.kind==='customer',system=message.sender.kind==='system';
 return <li className={`chat-message ${customer?'from-customer':system?'from-system':'from-staff'} ${internal?'is-internal':''} ${mine?'is-mine':''}`}>
  <div className="chat-bubble">
   {internal&&<span className="chat-internal-label">Ghi chú nội bộ — khách không thấy</span>}
   <MessageText text={message.text}/>
  </div>
  <div className="chat-meta"><strong>{mine?'Bạn':message.sender.displayName}</strong><time dateTime={message.createdAt}>{formatDate(message.createdAt)}</time></div>
 </li>;
});
