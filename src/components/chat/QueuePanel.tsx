import { useEffect,useRef,useState,type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Search,X,UsersRound,TriangleAlert } from 'lucide-react';
import { queueTabs,type QueueTab } from '../../lib/chat/api';
import { careBadge,unreadLabel } from '../../lib/chat/care';
import type { Conversation } from '../../lib/chat/contract';
import { chatError } from '../../lib/chat/errors';
import { queueOptions,useChat } from '../../lib/chat/provider';
import { formatDate } from '../../lib/utils';
import { Button,EmptyState,ErrorState,Loading } from '../ui';
export function ConversationRow({c,principalId,active}:{c:Conversation;principalId:string;active:boolean}){
 const badge=careBadge(c,principalId);
 return <NavLink to={`/chat/${c.id}`} className={`chat-row ${active?'active':''}`} aria-current={active?'page':undefined}>
  <div className="chat-row-top"><strong className="chat-row-name">{c.customer?.displayName||'Khách hàng'}</strong><time dateTime={c.updatedAt}>{formatDate(c.updatedAt)}</time></div>
  <div className="chat-row-sub"><span className="chat-account">STK {c.accountRef}</span>{c.unreadCount>0&&<span className="chat-unread" aria-label={`${c.unreadCount} tin chưa đọc`}>{unreadLabel(c.unreadCount)}</span>}</div>
  <p className="chat-row-subject">{c.subject}</p>
  <div className="chat-row-badges"><span className={`chat-care chat-care-${badge.tone}`}>{badge.label}</span>{badge.helpers>0&&!badge.helping&&<span className="chat-care chat-care-plain"><UsersRound size={13}/>+{badge.helpers} người hỗ trợ</span>}{badge.helping&&c.owner?.id!==principalId&&<span className="chat-care chat-care-plain">Bạn đang hỗ trợ</span>}{c.needsReview&&<span className="chat-care chat-care-warn"><TriangleAlert size={13}/>Cần kiểm tra</span>}</div>
 </NavLink>;
}
export function QueuePanel({activeId}:{activeId?:string}){
 const {session,ready,principalId,readOnly}=useChat();
 const tabs=(Object.keys(queueTabs) as QueueTab[]).filter(t=>!(readOnly&&t==='mine'));
 const [tab,setTab]=useState<QueueTab>(readOnly?'unclaimed':'mine');const [search,setSearch]=useState('');const [accountRef,setAccountRef]=useState('');
 // Mỗi tab + STK là một query key riêng: đổi tab hoặc ô tìm thì cursor cũ bị bỏ (Gateway trả 422 nếu dùng chéo).
 const list=useInfiniteQuery(queueOptions(session,tab,accountRef,ready));
 const end=useRef<HTMLDivElement>(null);
 useEffect(()=>{const el=end.current;if(!el)return;const io=new IntersectionObserver(([e])=>{if(e.isIntersecting&&list.hasNextPage&&!list.isFetchingNextPage)void list.fetchNextPage();});io.observe(el);return ()=>io.disconnect();},[list.hasNextPage,list.isFetchingNextPage,list.fetchNextPage]);
 const items=[...new Map((list.data?.pages.flatMap(p=>p.items)??[]).map(c=>[c.id,c])).values()];
 const unread=items.reduce((n,c)=>n+c.unreadCount,0);
 function submit(e:FormEvent){e.preventDefault();setAccountRef(search.trim());}
 return <section className="chat-pool" aria-label="Danh sách hội thoại">
  <div className="chat-tabs" role="tablist" aria-label="Lọc hội thoại">{tabs.map(t=><button key={t} type="button" role="tab" aria-selected={tab===t} onClick={()=>setTab(t)}>{queueTabs[t].label}{tab===t&&unread>0&&!readOnly&&<span className="chat-unread">{unreadLabel(unread)}</span>}</button>)}</div>
  <form className="chat-search" onSubmit={submit} role="search"><Search size={17}/><input aria-label="Tìm theo STK" placeholder="Nhập đủ STK rồi Enter" value={search} onChange={e=>{setSearch(e.target.value);if(!e.target.value)setAccountRef('');}} maxLength={64} inputMode="text" autoComplete="off"/>{accountRef&&<button type="button" className="icon-plain" aria-label="Bỏ lọc STK" onClick={()=>{setSearch('');setAccountRef('');}}><X size={16}/></button>}</form>
  {accountRef&&<p className="chat-filter-note">Lọc STK đúng: <strong>{accountRef}</strong></p>}
  <div className="chat-pool-list">
   {!ready||list.isPending?<Loading label="Đang tải hội thoại…"/>:list.error?<ErrorState message={chatError(list.error).message} onRetry={()=>list.refetch()}/>:!items.length?<EmptyState search={Boolean(accountRef)} title={accountRef?'Không có hội thoại khớp STK':'Chưa có hội thoại'} description={accountRef?'Tìm theo STK cần nhập đúng và đủ số tài khoản.':tab==='unclaimed'?'Khách mới nhắn sẽ xuất hiện ở đây.':'Không có hội thoại ở mục này.'}/>:
   <ul>{items.map(c=><li key={c.id}><ConversationRow c={c} principalId={principalId} active={c.id===activeId}/></li>)}</ul>}
   <div ref={end} className="chat-pool-end">{list.hasNextPage&&<Button variant="ghost" loading={list.isFetchingNextPage} onClick={()=>void list.fetchNextPage()}>Còn nữa — tải thêm</Button>}</div>
  </div>
 </section>;
}
