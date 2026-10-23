import { useEffect,useState,lazy,Suspense } from 'react';
import { NavLink,Navigate,Route,Routes,useLocation } from 'react-router-dom';
import { Phone,BookOpen,Ticket,FolderTree,Users,LogOut,Sun,Moon,Menu,ChevronRight,Headphones,UserRound,X,MessagesSquare } from 'lucide-react';
import { useAuth } from './lib/auth';
import { initials } from './lib/utils';
import { Button,Loading } from './components/ui';
import Login from './pages/Login';
import Account from './pages/Account';
import Tickets from './pages/Tickets';
import Catalogs from './pages/Catalogs';
import UsersPage from './pages/Users';
import {callAccess} from './lib/call-log-types';
const CallLogs=lazy(()=>import('./pages/CallLogs'));
const CareLogs=lazy(()=>import('./pages/CareLogs'));
const Library=lazy(()=>import('./pages/Library'));
const Chat=lazy(()=>import('./pages/Chat'));
import { chatAccess } from './lib/chat/access';
import { ChatProvider,useChat } from './lib/chat/provider';
import { unreadLabel } from './lib/chat/care';
import { useFeatures } from './lib/features';
import { careAccess } from './lib/care-log-types';
export default function App(){
 const {profile,session,loading,recovery,signOut}=useAuth();const [dark,setDark]=useState(document.documentElement.dataset.theme==='dark');const [menu,setMenu]=useState(false);const location=useLocation();const [online,setOnline]=useState(navigator.onLine);const features=useFeatures(Boolean(profile?.active));
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';try{localStorage.setItem('cskh-theme',dark?'dark':'light');}catch{/* Preference is optional. */}},[dark]);
 useEffect(()=>{setMenu(false);},[location.pathname]);
 useEffect(()=>{const on=()=>setOnline(navigator.onLine);window.addEventListener('online',on);window.addEventListener('offline',on);return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',on);};},[]);
 if(loading)return <Loading label="Đang mở không gian làm việc…"/>;
 if(!session||(!profile&&!recovery))return <Login/>;
 // Phân hệ Chat chỉ hiện khi Admin bật cờ chat_module và tài khoản có quyền Chat.
 const chatOn=features.on('chat_module')&&chatAccess(profile)!=='none';
 const links=[...(chatOn?[{to:'/chat',label:'Chat khách hàng',icon:MessagesSquare}]:[]),...(callAccess(profile)!=='none'?[{to:'/call-logs',label:'Nhật ký cuộc gọi',icon:Phone}]:[]),...(careAccess(profile)!=='none'?[{to:'/care-logs',label:'Nhật ký CSKH',icon:Headphones}]:[]),{to:'/tickets',label:profile?.role==='viewer'?'Tra cứu ticket':'Quản lý ticket',icon:Ticket},{to:'/library',label:'Thư viện lời giải',icon:BookOpen},{to:'/catalogs',label:'Danh mục',icon:FolderTree},...(profile?.role==='admin'?[{to:'/users',label:'Tài khoản',icon:Users}]:[])];
 const pageName=links.find(x=>location.pathname.startsWith(x.to))?.label||'Tài khoản của bạn';
 return <ChatProvider profile={profile} enabled={chatOn}><div className="app-shell"><a href="#main-content" className="skip-link">Đến nội dung chính</a>{menu&&<button className="sidebar-backdrop" aria-label="Đóng menu" onClick={()=>setMenu(false)}/>}<aside className={`sidebar ${menu?'sidebar-open':''}`}><div className="brand"><img src={dark?'/LOGO.png':'/LOGO Light.png'} alt="SHS"/><button className="mobile-close" aria-label="Đóng menu" onClick={()=>setMenu(false)}><X/></button></div><div className="workspace-label"><Headphones size={15}/><span>Không gian CSKH</span></div><div className="nav-caption">KHÔNG GIAN LÀM VIỆC</div><nav aria-label="Điều hướng chính">{links.map(({to,label,icon:Icon})=><NavLink key={to} to={to} className={({isActive})=>`nav-link ${isActive?'active':''} ${to==='/catalogs'?'nav-separated':''}`}><Icon size={20}/><span>{label}</span>{to==='/chat'&&<ChatUnread/>}</NavLink>)}</nav><div className="sidebar-note"><div className="small-orange-line"/><p>Mỗi lời giải hôm nay,<br/>một kinh nghiệm cho ngày mai.</p></div><div className="sidebar-account"><NavLink to="/account" className="account-link"><span className="avatar">{initials(profile?.name||'CSKH')}</span><span><strong>{profile?.name||'CSKH'}</strong><small>{profile?.role==='admin'?'Quản trị viên':profile?.role==='viewer'?'Chỉ xem':'Thành viên CSKH'}</small></span><ChevronRight size={16}/></NavLink><button className="logout-button" onClick={signOut}><LogOut size={16}/>Đăng xuất</button></div></aside><div className="main-shell"><header className="topbar"><div className="breadcrumbs"><Button variant="ghost" className="icon-button menu-toggle" onClick={()=>setMenu(true)} aria-label="Mở menu"><Menu size={21}/></Button><span>CSKH</span><ChevronRight size={14}/><strong>{pageName}</strong></div><div className="topbar-actions"><button className="theme-button" onClick={()=>setDark(!dark)} aria-label={dark?'Chuyển giao diện sáng':'Chuyển giao diện tối'}>{dark?<Moon size={17}/>:<Sun size={17}/>}<span>{dark?'Giao diện tối':'Giao diện sáng'}</span><span className={`theme-switch ${dark?'on':''}`}><i/></span></button><NavLink className="topbar-avatar" to="/account" aria-label="Tài khoản của bạn"><UserRound size={19}/></NavLink></div></header>{!online&&<div className="offline-banner" role="status">Đang mất kết nối mạng. Dữ liệu đang nhập được giữ trên màn hình; hãy kết nối lại trước khi lưu.</div>}<main id="main-content">{recovery?<Account/>:<Routes><Route path="/call-logs" element={<Suspense fallback={<Loading/>}><CallLogs key={`${profile?.id}-${callAccess(profile)}`}/></Suspense>}/><Route path="/care-logs" element={<Suspense fallback={<Loading/>}><CareLogs key={careAccess(profile)}/></Suspense>}/><Route path="/chat/:conversationId?" element={chatOn?<Suspense fallback={<Loading/>}><Chat key={`${profile?.id}-${chatAccess(profile)}`}/></Suspense>:features.loading?<Loading/>:<Navigate to="/tickets" replace/>}/><Route path="/tickets" element={<Tickets key="tickets"/>}/><Route path="/library" element={<Suspense fallback={<Loading/>}><Library key={`${profile?.role}-${careAccess(profile)}-${profile?.active}`}/></Suspense>}/><Route path="/catalogs" element={<Catalogs/>}/><Route path="/users" element={profile?.role==='admin'?<UsersPage/>:<Navigate to="/tickets" replace/>}/><Route path="/account" element={<Account/>}/><Route path="*" element={<Navigate to="/tickets" replace/>}/></Routes>}</main><footer className="app-footer"><span>SHS · Không gian làm việc CSKH</span><span>Thời gian hiển thị theo giờ Việt Nam</span></footer></div></div></ChatProvider>;
}
function ChatUnread(){const {unread}=useChat();return unread?<span className="nav-badge" aria-label={`${unread} tin chưa đọc`}>{unreadLabel(unread)}</span>:null;}
