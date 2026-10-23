import {useState} from 'react';
import type {LibraryInput} from '../lib/library-types';
import {errorMessage} from '../lib/utils';
import {Button,Field,Modal} from './ui';
export default function LibraryForm({initial,onSave,onClose,editing=false,sourceLabel}:{initial:LibraryInput;onSave:(input:LibraryInput)=>Promise<void>;onClose:()=>void;editing?:boolean;sourceLabel?:string}){
 const [form,setForm]=useState<LibraryInput>({title:initial.title,description:initial.description,resolution:initial.resolution}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <Modal open onClose={()=>{if(!busy)onClose();}} title={editing?'Chỉnh sửa bài thư viện':'Lưu vào thư viện'} description={editing?'Thay đổi chỉ áp dụng cho bài thư viện.':`Lưu bản sao nội dung${sourceLabel?` từ ${sourceLabel}`:''}. Xóa nguồn vẫn giữ bài và ảnh trong thư viện.`} wide>
  <form onSubmit={async e=>{e.preventDefault();if(busy)return;setBusy(true);setError('');try{await onSave({...form,title:form.title.trim(),resolution:form.resolution.trim()});}catch(err){setError(errorMessage(err));}finally{setBusy(false);}}}>
   <div className="form-section library-form-fields"><Field label="Tiêu đề" required><input autoFocus required maxLength={240} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></Field>
   <Field label="Mô tả vấn đề"><textarea rows={5} maxLength={100000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
   <Field label="Lời giải" required><textarea required rows={7} maxLength={100000} value={form.resolution} onChange={e=>setForm({...form,resolution:e.target.value})}/></Field>
   {!editing&&<p className="muted">Kiểm tra nội dung trước khi lưu và lược bỏ thông tin khách hàng không cần thiết. Ảnh đã tải xong của ticket được giữ cùng bài.</p>}
   {error&&<div className="form-error" role="alert">{error}</div>}</div>
   <div className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>Hủy</Button><Button loading={busy} disabled={!form.title.trim()||!form.resolution.trim()}>{editing?'Lưu thay đổi':'Lưu vào thư viện'}</Button></div>
  </form>
 </Modal>;
}
