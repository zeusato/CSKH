import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient,QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AuthProvider } from './lib/auth';
import App from './App';
import './styles.css';
import { startAppChatKeepalive } from './lib/chat/start-keepalive';
const stopChatKeepalive = startAppChatKeepalive();
if (import.meta.hot) import.meta.hot.dispose(stopChatKeepalive);
const queryClient=new QueryClient({defaultOptions:{queries:{staleTime:15000,retry:1,refetchOnWindowFocus:true}}});
class ErrorBoundary extends React.Component<{children:React.ReactNode},{error:boolean}>{state={error:false};static getDerivedStateFromError(){return {error:true};}render(){return this.state.error?<div className="fatal-error"><h1>Ứng dụng gặp sự cố</h1><p>Dữ liệu đã lưu vẫn được giữ trên hệ thống.</p><button className="button button-primary" onClick={()=>location.reload()}>Tải lại ứng dụng</button></div>:this.props.children;}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><QueryClientProvider client={queryClient}><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter><Toaster position="bottom-right" richColors closeButton/></QueryClientProvider></ErrorBoundary></React.StrictMode>);
