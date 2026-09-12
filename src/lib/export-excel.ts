import type { Catalogs,Cursor,Filters,Ticket,SearchPage } from './types';
import { originColumns, originLabels } from './ticket-origin';
import { statuses } from './types';
import { supabase } from './supabase';
import { searchArgs } from './api';
import { formatDate } from './utils';
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function exportTickets(filters:Filters,catalogs:Catalogs|undefined,progress:(n:number)=>void){
 const worker=new Worker(new URL('../workers/excel.worker.ts',import.meta.url),{type:'module'});
 try{
  const result=new Promise<ArrayBuffer>((resolve,reject)=>{worker.onmessage=e=>{if(e.data.error)reject(new Error(e.data.error));else resolve(e.data.buffer);};worker.onerror=e=>reject(new Error(e.message));});
  const labels:Record<string,string>={q:'Từ khóa',status:'Trạng thái',category:'Phân mục',system:'Hệ thống',department:'Bộ phận xử lý',staff:'Nhân sự xử lý',from:'Từ ngày',to:'Đến hết ngày',dateField:'Lọc theo thời điểm',sort:'Thứ tự trên màn hình'};
  const values:Record<string,string>={...filters,status:statuses[filters.status as keyof typeof statuses]||'Tất cả',category:catalogs?.categories.find(x=>x.id===filters.category)?.name||'Tất cả',system:catalogs?.systems.find(x=>x.id===filters.system)?.name||'Tất cả',department:catalogs?.departments.find(x=>x.id===filters.department)?.name||'Tất cả',staff:catalogs?.staff.find(x=>x.id===filters.staff)?.name||'Tất cả'};
  const times:Record<string,string>={received_at:'Tiếp nhận',created_at:'Tạo ticket',completed_at:'Hoàn thành'};values.dateField=times[filters.dateField];values.sort=times[filters.sort]+' mới nhất';
  worker.postMessage({type:'start',filters:Object.fromEntries(Object.entries(values).map(([k,v])=>[labels[k],v]))});let cursor:Cursor|null=null;let count=0;const cutoff=new Date().toISOString();let more=true;const seen=new Set<string>();
  while(more){
   const search: {data:SearchPage|null;error:unknown}=await supabase.rpc('search_tickets',searchArgs({...filters,sort:'created_at'},cursor,500,cutoff));if(search.error)throw search.error;if(!search.data)throw new Error('Không tải được dữ liệu xuất.');
   const ids=(search.data.items as {id:string}[]).map(x=>x.id).filter(id=>!seen.has(id));ids.forEach(id=>seen.add(id));if(!ids.length){cursor=search.data.nextCursor;more=search.data.hasMore;continue;}
   const {data,error}=await supabase.from('tickets').select(`id,code,title,description,resolution,status,created_at,received_at,completed_at,category_id,system_id,department_id,staff_id,created_by,updated_by,updated_at,ticket_attachments(count),${originColumns}`).in('id',ids);if(error)throw error;
   const byId=new Map(data.map(x=>[x.id,x]));const rows=ids.flatMap(id=>{const value=byId.get(id);if(!value)return[];const t=value as unknown as Ticket&{ticket_attachments:{count:number}[]};return [[t.code,t.title,t.description,t.resolution,statuses[t.status],t.received_at,t.created_at,t.completed_at,catalogs?.systems.find(x=>x.id===t.system_id)?.name||'',catalogs?.categories.find(x=>x.id===t.category_id)?.name||'',catalogs?.departments.find(x=>x.id===t.department_id)?.name||'',catalogs?.staff.find(x=>x.id===t.staff_id)?.name||'',catalogs?.app_users.find(x=>x.id===t.created_by)?.name||'',t.updated_at,t.ticket_attachments[0]?.count||0,t.origin?originLabels[t.origin]:'Chưa ghi nhận',t.broker_name||'',t.broker_user||'',t.broker_department||'',t.customer_name||'',t.customer_account||'',t.customer_broker||'']];});
   worker.postMessage({type:'rows',rows});count+=rows.length;progress(count);cursor=search.data.nextCursor;more=search.data.hasMore;
  }
  worker.postMessage({type:'finish'});download(new Blob([await result],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`SHS-Ticket-${new Date().toISOString().slice(0,10)}.xlsx`);
 }finally{worker.terminate();}
}
