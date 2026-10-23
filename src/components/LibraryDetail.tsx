import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {toast} from 'sonner';
import {useAuth} from '../lib/auth';
import {supabase} from '../lib/supabase';
import {deleteLibraryEntry,getLibraryAttachments,getLibraryEntry,updateLibraryEntry} from '../lib/library-api';
import {canWriteLibrary,librarySourceLabels} from '../lib/library-types';
import {errorMessage,formatDate} from '../lib/utils';
import {Button,Confirm,ErrorState,Loading,Modal} from './ui';
import LibraryForm from './LibraryForm';
export default function LibraryDetail({id,onClose}:{id:string;onClose:()=>void}){
 const {profile}=useAuth(),cache=useQueryClient(),navigate=useNavigate();
 const query=useQuery({queryKey:['library-entry',id],queryFn:({signal})=>getLibraryEntry(id,signal)});
 const images=useQuery({queryKey:['library-images',id],queryFn:({signal})=>getLibraryAttachments(id,signal),refetchInterval:240000});
 const [edit,setEdit]=useState(false),[remove,setRemove]=useState(false),[busy,setBusy]=useState(false),[pdfBusy,setPdfBusy]=useState(false),[sourceBusy,setSourceBusy]=useState(false),[error,setError]=useState('');
 const entry=query.data,editable=entry&&canWriteLibrary(profile,entry.source_type);
 function invalidate(){void cache.invalidateQueries({queryKey:['library']});void cache.invalidateQueries({queryKey:['library-source']});void cache.invalidateQueries({queryKey:['library-entry',id]});}
 async function openSource(){if(!entry)return;setSourceBusy(true);setError('');try{const {data,error:e}=await supabase.from(entry.source_type==='ticket'?'tickets':'care_logs').select('id').eq('id',entry.source_id).maybeSingle();if(e)throw e;if(!data){setError('Nguồn đã bị xóa hoặc tài khoản không có quyền xem nguồn. Bài thư viện vẫn được giữ nguyên.');return;}navigate(entry.source_type==='ticket'?`/tickets?ticket=${data.id}`:`/care-logs?log=${data.id}`);}catch(e){setError(errorMessage(e));}finally{setSourceBusy(false);}}
 return <><Modal open onClose={onClose} title={entry?.code||'Bài thư viện'} description="Nội dung và ảnh được lưu độc lập với ticket, nhật ký CSKH." wide>
  {query.isPending?<Loading/>:query.error?<ErrorState message={errorMessage(query.error)} onRetry={()=>query.refetch()}/>:entry&&<div className="ticket-detail">
   <div className="detail-top"><div><span className="ticket-code">{librarySourceLabels[entry.source_type]} · {entry.source_code}</span><h2>{entry.title}</h2></div><div className="detail-actions">
    <Button variant="secondary" loading={sourceBusy} onClick={openSource}>Xem nguồn</Button>
    <Button variant="secondary" loading={pdfBusy} onClick={async()=>{setPdfBusy(true);setError('');try{const {exportLibraryPdf}=await import('../lib/library-export');await exportLibraryPdf(id);}catch(e){setError(errorMessage(e));}finally{setPdfBusy(false);}}}>Xuất PDF</Button>
    {editable&&<Button onClick={()=>setEdit(true)}>Chỉnh sửa</Button>}</div></div>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <p className="muted">Lưu {formatDate(entry.created_at)} · Cập nhật {formatDate(entry.updated_at)}{entry.migrated?' · Chuyển từ thư viện cũ':''}</p>
   <div className="detail-layout"><div className="detail-content"><section><h3>Mô tả vấn đề</h3><p className="prose-text">{entry.description||'Chưa có mô tả.'}</p></section><section className="resolution-block"><h3>Lời giải</h3><p className="prose-text">{entry.resolution||'Bài từ thư viện cũ chưa ghi lời giải.'}</p></section>
   <section><h3>Ảnh đính kèm</h3>{images.isPending?<Loading/>:images.error?<ErrorState message={errorMessage(images.error)} onRetry={()=>images.refetch()}/>:!images.data?.length?<p className="muted">Chưa có ảnh đính kèm.</p>:<div className="attachment-gallery">{images.data.map(a=><div className="attachment-card" key={a.id}>{a.url?<a className="library-attachment-link" href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name}/></a>:<p>Không tải được ảnh. <button className="text-button" onClick={()=>images.refetch()}>Thử lại</button></p>}<div><span>{a.name}</span></div></div>)}</div>}</section></div>
   <aside className="detail-facts"><h3>Bối cảnh lúc lưu</h3><dl className="care-detail-fields library-detail-facts">{[['Hệ thống',entry.system_name],['Phân mục',entry.category_name],['Tiếp nhận',formatDate(entry.source_received_at)],['Hoàn thành',formatDate(entry.source_completed_at)],...Object.entries(entry.source_context)].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'Chưa ghi nhận'}</dd></div>)}</dl>{editable&&<Button variant="danger" onClick={()=>setRemove(true)}>Xóa bài thư viện</Button>}</aside></div>
  </div>}
 </Modal>
 {editable&&entry&&edit&&<LibraryForm editing initial={entry} onClose={()=>setEdit(false)} onSave={async input=>{await updateLibraryEntry(entry,input);setEdit(false);invalidate();toast.success('Đã cập nhật bài thư viện');}}/>}
 <Confirm open={Boolean(editable&&remove)} title={`Xóa ${entry?.code}?`} description="Bài bị xóa khỏi thư viện. Ticket hoặc nhật ký nguồn vẫn được giữ nguyên." loading={busy} onClose={()=>{if(!busy)setRemove(false);}} onConfirm={async()=>{if(!entry)return;setBusy(true);try{await deleteLibraryEntry(entry);invalidate();onClose();toast.success('Đã xóa bài thư viện');}catch(e){setRemove(false);setError(errorMessage(e));}finally{setBusy(false);}}}/></>;
}
