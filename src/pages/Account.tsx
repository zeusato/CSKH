import { useState,type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck,KeyRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { Button,Field } from '../components/ui';
import { errorMessage,initials } from '../lib/utils';
export default function Account(){
 const {profile,session,recovery,setRecovery}=useAuth();const [password,setPassword]=useState('');const [repeat,setRepeat]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const navigate=useNavigate();
 async function submit(e:FormEvent){e.preventDefault();setError('');if(password!==repeat){setError('Hai mật khẩu chưa trùng nhau.');return;}setBusy(true);try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;setPassword('');setRepeat('');setRecovery(false);toast.success('Đã cập nhật mật khẩu');navigate('/tickets');}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <div className="page account-page"><div className="page-heading"><div className="eyebrow">KHÔNG GIAN CÁ NHÂN</div><h1>{recovery?'Đặt mật khẩu mới':'Tài khoản của bạn'}</h1><p>Thông tin đăng nhập và bảo mật tài khoản.</p></div><div className="account-grid"><section className="panel profile-card"><span className="avatar avatar-large">{initials(profile?.name||'CSKH')}</span><h2>{profile?.name||'Tài khoản CSKH'}</h2><p className="muted">{session?.user.email}</p><span className="role-label"><ShieldCheck size={16}/>{profile?.role==='admin'?'Quản trị viên':profile?.role==='viewer'?'Chỉ xem':'Thành viên CSKH'}</span></section><section className="panel password-card"><h2><KeyRound size={21}/>Thay đổi mật khẩu</h2><p className="muted">Sử dụng ít nhất 8 ký tự để bảo vệ tài khoản.</p><form onSubmit={submit}><Field label="Mật khẩu mới" required><input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></Field><Field label="Nhập lại mật khẩu" required><input type="password" required minLength={8} autoComplete="new-password" value={repeat} onChange={e=>setRepeat(e.target.value)}/></Field>{error&&<p className="form-error" role="alert">{error}</p>}<Button type="submit" loading={busy}>Cập nhật mật khẩu</Button></form></section></div></div>;
}
