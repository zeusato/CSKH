import type { Profile } from '../types';
export type ChatAccess='none'|'read'|'agent'|'supervisor';
export const chatAccessLabels:Record<ChatAccess,string>={none:'Không truy cập',read:'Chỉ xem',agent:'Nhân viên',supervisor:'Giám sát'};
// Admin không mặc nhiên có quyền Chat: phải được bật như mọi người (CHAT-PLAN §11 #1).
export function chatAccess(p:Profile|null):ChatAccess{if(!p?.active)return 'none';const a=p.chat_access||'none';if(p.role==='viewer')return a==='read'?'read':'none';return a in chatAccessLabels?a:'none';}
export function chatAccessOptions(role:string):ChatAccess[]{return role==='viewer'?['none','read']:['none','read','agent','supervisor'];}
// Quyền chat khi đổi vai trò: Chỉ xem không giữ được Nhân viên/Giám sát.
export function chatAccessForRole(role:string,current:string):ChatAccess{return role==='viewer'&&current!=='none'?'read':current as ChatAccess;}
export type ChatSyncState='off'|'ok'|'pending'|'failed';
export function chatSyncState(p:Profile):ChatSyncState{if(p.chat_sync_error)return 'failed';if(chatAccess(p)==='none')return 'off';return p.chat_synced_at?'ok':'pending';}
// Kết quả đồng bộ trả về từ admin-users (CHAT-PLAN §3.2).
export type ChatSyncReply={chatSync?:'ok'|'failed'|'skipped';chatSyncError?:string;chatRevoke?:boolean};
