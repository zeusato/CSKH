import { useState,type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listMembers } from '../../lib/chat/api';
import { LIMITS,type Conversation } from '../../lib/chat/contract';
import { chatError } from '../../lib/chat/errors';
import { useChat } from '../../lib/chat/provider';
import { Button,EmptyState,ErrorState,Field,Loading,Modal } from '../ui';
// Danh bạ lấy từ Gateway: targetPrincipalId là ID principal của Gateway, không phải app_users.id.
export function TransferDialog({open,mode,conversation,onClose,onSubmit}:{open:boolean;mode:'transfer'|'add';conversation:Conversation;onClose:()=>void;onSubmit:(principalId:string,reason:string)=>Promise<void>}){
 const {session,principalId}=useChat();const [target,setTarget]=useState('');const [reason,setReason]=useState('');const [busy,setBusy]=useState(false);
 const members=useQuery({queryKey:['chat-members'],queryFn:()=>listMembers(session!),enabled:open&&Boolean(session),staleTime:60000});
 const exclude=new Set([principalId,conversation.owner?.id,...(mode==='add'?(conversation.participants||[]).map(p=>p.id):[])]);
 const options=(members.data||[]).filter(m=>!exclude.has(m.id));
 async function submit(e:FormEvent){e.preventDefault();if(!target)return;setBusy(true);try{await onSubmit(target,reason.trim());setTarget('');setReason('');}finally{setBusy(false);}}
 return <Modal open={open} onClose={()=>{if(!busy)onClose();}} title={mode==='transfer'?'Chuyển cho đồng nghiệp':'Thêm người hỗ trợ'} description="Chỉ hiện đồng nghiệp đã từng vào Chat và đang có quyền Nhân viên hoặc Giám sát.">
  <form className="simple-form chat-transfer" onSubmit={submit}>
   <fieldset><legend className="sr-only">Chọn đồng nghiệp</legend>
    {members.isPending?<Loading/>:members.error?<ErrorState message={chatError(members.error).message} onRetry={()=>members.refetch()}/>:!options.length?<EmptyState title="Chưa có đồng nghiệp phù hợp" description="Đồng nghiệp cần được cấp quyền Chat và mở Chat ít nhất một lần."/>:
    <div className="chat-member-list">{options.map(m=><label key={m.id} className={`chat-member ${target===m.id?'selected':''}`}><input type="radio" name="chat-member" value={m.id} checked={target===m.id} onChange={()=>setTarget(m.id)}/><span><strong>{m.displayName}</strong><small>{m.roles.includes('supervisor')?'Giám sát':'Nhân viên'}</small></span></label>)}</div>}
   </fieldset>
   {mode==='transfer'&&<Field label="Lý do chuyển" hint={`Không bắt buộc, tối đa ${LIMITS.reasonMaxChars} ký tự. Sau khi chuyển, bạn không còn trả lời được trừ khi Tham gia hỗ trợ lại.`}><textarea rows={3} maxLength={LIMITS.reasonMaxChars} value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
   <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" loading={busy} disabled={!target}>{mode==='transfer'?'Chuyển hội thoại':'Thêm người hỗ trợ'}</Button></div>
  </form>
 </Modal>;
}
