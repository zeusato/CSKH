import { useState } from 'react';
import { statuses, type Filters } from '../lib/types';
import { Button, Field, Modal } from './ui';

export default function ExportExcelDialog({filters, busy, onClose, onExport}: {filters: Filters; busy: boolean; onClose: () => void; onExport: (filters: Filters) => void}) {
 const [selection, setSelection] = useState<Filters>({...filters, status: '', dateField: filters.dateField === 'completed_at' ? 'received_at' : filters.dateField});
 return <Modal open title="Xuất Excel" description="Xuất ticket ở mọi trạng thái, kể cả chưa hoàn tất xử lý." onClose={() => { if (!busy) onClose(); }}>
  <form className="simple-form" onSubmit={e => { e.preventDefault(); onExport(selection); }}>
   <fieldset disabled={busy} className="simple-form">
    <Field label="Trạng thái xuất"><select value={selection.status} onChange={e => setSelection({...selection, status: e.target.value})}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
    <Field label="Lọc theo thời điểm"><select value={selection.dateField} onChange={e => setSelection({...selection, dateField: e.target.value})}><option value="received_at">Tiếp nhận</option><option value="created_at">Tạo ticket</option><option value="completed_at">Hoàn thành (chỉ ticket đã xử lý)</option></select></Field>
    <div className="form-grid"><Field label="Từ ngày"><input type="date" value={selection.from} max={selection.to || undefined} onChange={e => setSelection({...selection, from: e.target.value})}/></Field><Field label="Đến hết ngày"><input type="date" value={selection.to} min={selection.from || undefined} onChange={e => setSelection({...selection, to: e.target.value})}/></Field></div>
    <p className="muted" style={{margin:'20px 28px'}}>Giữ các bộ lọc từ khóa, hệ thống, phân mục và bên xử lý đang chọn trên trang.</p>
   </fieldset>
   <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose} disabled={busy}>Hủy</Button><Button type="submit" loading={busy}>Xuất Excel</Button></div>
  </form>
 </Modal>;
}
