import type { TicketOrigin } from '../lib/ticket-origin';
import { Field } from './ui';

export default function TicketOriginFields({ value, onChange, required = true }: { value: TicketOrigin; onChange: (value: TicketOrigin) => void; required?: boolean }) {
 const fields = value.origin === 'broker'
  ? [['broker_name', 'Tên MG'], ['broker_user', 'User MG'], ['broker_department', 'Phòng MG']] as const
  : [['customer_name', 'Tên KH'], ['customer_account', 'Số TK'], ['customer_broker', 'MG QL']] as const;
 return <div className="ticket-origin">
  <fieldset className="origin-choice"><legend>Vấn đề phát sinh từ{required && <span className="required"> *</span>}</legend>
   <div className="origin-options">{([['broker', 'MG'], ['customer', 'Khách hàng']] as const).map(([origin, label]) =>
    <label key={origin} className={`origin-option ${value.origin === origin ? 'selected' : ''}`}>
     <input type="radio" name="ticket-origin" value={origin} checked={value.origin === origin} required={required} onChange={() => onChange({ ...value, origin, customer_account: origin === 'customer' && !value.customer_account ? '069C' : value.customer_account })}/>{label}
    </label>)}</div>
  </fieldset>
  {value.origin ? <div className="origin-fields">{fields.map(([key, label]) => <Field key={key} label={label} hint={key === 'customer_account' ? 'Nhập thêm 6 ký tự sau 069C. Tối đa 10 ký tự.' : undefined}>
   <input type="text" maxLength={key === 'customer_account' ? 10 : 240} autoComplete="off" value={value[key] || ''} onChange={e => onChange({ ...value, [key]: e.target.value })}/>
  </Field>)}</div> : !required && <p className="muted">Ticket cũ chưa ghi nhận nguồn phát sinh.</p>}
 </div>;
}
