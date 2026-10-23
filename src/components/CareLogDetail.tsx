import {useEffect,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {toast} from 'sonner';
import {Badge,Button,Confirm,ErrorState,Loading,Modal} from './ui';
import {getCareLog,deleteCareLog} from '../lib/care-log-api';
import {careAccess} from '../lib/care-log-types';
import {careColumns} from '../lib/care-log-import';
import {careValues} from '../lib/care-log-files';
import {useAuth} from '../lib/auth';
import {errorMessage} from '../lib/utils';
import type {Catalogs} from '../lib/types';
import CareLogForm from './CareLogForm';
import SaveToLibrary from './SaveToLibrary';
export default function CareLogDetail({id,catalogs,onClose,onChanged}:{id:string;catalogs:Catalogs;onClose:()=>void;onChanged:()=>void}){
 const {profile}=useAuth();const editable=careAccess(profile)==='write';const query=useQuery({queryKey:['care-log',id],queryFn:()=>getCareLog(id)});
 const [edit,setEdit]=useState(false),[remove,setRemove]=useState(false),[busy,setBusy]=useState(false),[pdfBusy,setPdfBusy]=useState(false),[error,setError]=useState(''),[pdf,setPdf]=useState('');
 const log=query.data,values=log?careValues(log,catalogs):null;
 useEffect(()=>()=>{if(pdf)URL.revokeObjectURL(pdf);},[pdf]);useEffect(()=>{setPdf('');},[log?.version]);
 async function download(){if(!log)return;setPdfBusy(true);setError('');try{const fresh=await getCareLog(id);const {exportCarePdf}=await import('../lib/care-log-pdf');const blob=await exportCarePdf(fresh,catalogs);const url=URL.createObjectURL(blob);setPdf(url);const a=document.createElement('a');a.href=url;a.download=`${fresh.code}.pdf`;a.click();}catch(e){setError(errorMessage(e));}finally{setPdfBusy(false);}}
 return <><Modal open onClose={onClose} title={log?.code||'Chi tiết nhật ký'} description="Phiếu theo dõi vấn đề CSKH" wide>{query.isPending?<Loading/>:query.error?<ErrorState message={errorMessage(query.error)} onRetry={()=>query.refetch()}/>:log&&values&&<div className="ticket-detail"><div className="detail-top"><div><Badge status={log.status}/><h2>{values.request_type}</h2></div><div className="detail-actions">{editable&&<SaveToLibrary source="care_log" id={log.id} version={log.version} code={log.code} initial={{title:log.description.replace(/\s+/g,' ').slice(0,240),description:log.description,resolution:log.response_content}}/>}{pdf&&<a href={pdf} download={`${log.code}.pdf`} className="button button-secondary">Tải PDF</a>}<Button variant="secondary" loading={pdfBusy} onClick={download}>Xuất PDF</Button>{editable&&<Button onClick={()=>setEdit(true)}>Chỉnh sửa</Button>}</div></div>{error&&<div role="alert" className="form-error">{error}</div>}<dl className="care-detail-fields">{careColumns.map(([key,label])=><div key={key} className={['description','response_content','notes'].includes(key)?'care-long-field':''}><dt>{label}</dt><dd>{values[key]||'Chưa ghi nhận'}</dd></div>)}</dl><div className="audit-info"><p>Người tạo: {values.created_by||'—'} · {values.created_at}</p><p>Cập nhật: {values.updated_by||'—'} · {values.updated_at}</p>{log.import_batch_id&&<p>Đợt nhập: {log.import_batch_id} · Dòng Excel {log.import_row_number}</p>}</div>{editable&&<Button variant="danger" onClick={()=>setRemove(true)}>Xóa nhật ký</Button>}</div>}</Modal>
 {editable&&edit&&log&&<CareLogForm record={log} catalogs={catalogs} onClose={()=>setEdit(false)} onSaved={()=>{setEdit(false);void query.refetch();onChanged();}}/>}
 <Confirm open={editable&&remove} title={`Xóa ${log?.code}?`} description="Nhật ký sẽ bị xóa. Nội dung đã lưu trong thư viện vẫn được giữ. Thao tác này không thể hoàn tác." loading={busy} onClose={()=>{if(!busy)setRemove(false);}} onConfirm={async()=>{if(!log)return;setBusy(true);try{await deleteCareLog(log);toast.success('Đã xóa nhật ký');onChanged();onClose();}catch(e){toast.error(errorMessage(e));}finally{setBusy(false);}}}/></>;
}
