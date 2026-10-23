import { Wifi,WifiOff,Volume2,VolumeX } from 'lucide-react';
import { useChat } from '../../lib/chat/provider';
// Chip cố định trong header: không chèn dòng làm nhảy bố cục khi mất/có kết nối.
export function ConnectionState(){
 const {realtime,status,sound,setSound,readOnly}=useChat();
 const down=status!=='ready'||realtime==='offline'||realtime==='failed';
 const label=status==='connecting'?'Đang kết nối máy chủ chat…':realtime==='failed'?'Lỗi kết nối thời gian thực':realtime==='offline'?'Mất kết nối thời gian thực — dữ liệu có thể chậm':realtime==='live'?'Đang cập nhật trực tiếp':'Đang kết nối…';
 return <div className="chat-connection"><span className={`chat-chip ${down?'chat-chip-warn':realtime==='live'?'chat-chip-ok':''}`} role="status">{down?<WifiOff size={15}/>:<Wifi size={15}/>}<span>{label}</span></span>{!readOnly&&<button type="button" className="chat-chip chat-sound" aria-pressed={sound} onClick={()=>setSound(!sound)}>{sound?<Volume2 size={15}/>:<VolumeX size={15}/>}<span>{sound?'Âm báo: bật':'Âm báo: tắt'}</span></button>}</div>;
}
