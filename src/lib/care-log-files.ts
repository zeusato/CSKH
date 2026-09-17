import type {Catalogs,Cursor} from './types';
import {statuses} from './types';
import {requestTypes,type CareLog,type CareFilters,type ImportIssue} from './care-log-types';
import {careColumns} from './care-log-import';
import {searchCareLogs} from './care-log-api';
import {formatDate} from './utils';
export function saveBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function careValues(log:CareLog,catalogs:Catalogs):Record<string,string>{
 const name=(items:{id:string;name:string}[],id:string|null)=>items.find(x=>x.id===id)?.name||'';
 return {...log,request_type:requestTypes[log.request_type],status:statuses[log.status],system_id:name(catalogs.systems,log.system_id),category_id:name(catalogs.categories,log.category_id),receiving_department_id:name(catalogs.departments,log.receiving_department_id),receiving_staff_id:name(catalogs.staff,log.receiving_staff_id),coordinating_department_id:name(catalogs.departments,log.coordinating_department_id),coordinating_staff_id:name(catalogs.staff,log.coordinating_staff_id),received_at:formatDate(log.received_at),completed_at:log.completed_at?formatDate(log.completed_at):'',created_by:name(catalogs.app_users,log.created_by),updated_by:name(catalogs.app_users,log.updated_by),created_at:formatDate(log.created_at),updated_at:formatDate(log.updated_at),version:String(log.version),import_batch_id:log.import_batch_id||'',import_row_number:String(log.import_row_number||'')};
}
export async function exportCareExcel(filters:CareFilters,catalogs:Catalogs,progress:(count:number)=>void){
 const worker=new Worker(new URL('../workers/care-log-export.worker.ts',import.meta.url),{type:'module'});let failure:Error|undefined;
 const result=new Promise<ArrayBuffer>((resolve,reject)=>{worker.onmessage=e=>{if(e.data.error){failure=new Error(e.data.error);reject(failure);}else resolve(e.data.buffer);};worker.onerror=e=>{failure=new Error(e.message);reject(failure);};});void result.catch(()=>{});
 try{
  const labels:Record<string,string>={q:'Từ khóa',status:'Trạng thái',request_type:'Phân loại yêu cầu',system_id:'Kênh phát sinh lỗi',category_id:'Phân mục',receiving_department_id:'Bộ phận tiếp nhận',receiving_staff_id:'Nhân sự tiếp nhận',coordinating_department_id:'Bộ phận phối hợp',coordinating_staff_id:'Nhân sự phối hợp',from:'Từ ngày',to:'Đến hết ngày',dateField:'Lọc thời điểm',sort:'Sắp xếp trên màn hình',import_batch_id:'Đợt nhập'};
  const times:Record<string,string>={received_at:'Tiếp nhận',completed_at:'Hoàn thành',created_at:'Tạo trên hệ thống'};
  const names:Record<string,{id:string;name:string}[]>={system_id:catalogs.systems,category_id:catalogs.categories,receiving_department_id:catalogs.departments,coordinating_department_id:catalogs.departments,receiving_staff_id:catalogs.staff,coordinating_staff_id:catalogs.staff};
  const reportFilters=Object.fromEntries(Object.entries(filters).map(([key,v])=>[labels[key],!v?'Tất cả':key==='status'?statuses[v as keyof typeof statuses]:key==='request_type'?requestTypes[v as keyof typeof requestTypes]:key==='dateField'||key==='sort'?times[v]:names[key]?names[key].find(x=>x.id===v)?.name||v:v]));
  worker.postMessage({type:'start',filters:reportFilters,headers:['Mã nhật ký',...careColumns.map(x=>x[1]),'Người tạo','Tạo trên hệ thống','Người cập nhật','Cập nhật','Đợt nhập','Dòng Excel']});
  let cursor:Cursor|null=null,count=0;const cutoff=new Date().toISOString(),seen=new Set<string>();
  do{if(failure)throw failure;const page=await searchCareLogs({...filters,sort:'created_at'},cursor,undefined,500,cutoff);const rows=page.items.filter(x=>!seen.has(x.id)).map(log=>{seen.add(log.id);const values=careValues(log,catalogs);return [log.code,...careColumns.map(([key])=>key==='received_at'||key==='completed_at'?log[key]:values[key]),values.created_by,log.created_at,values.updated_by,log.updated_at,log.import_batch_id||'',log.import_row_number||''];});worker.postMessage({type:'rows',rows});count+=rows.length;progress(count);if(!page.hasMore)break;if(!page.nextCursor||JSON.stringify(page.nextCursor)===JSON.stringify(cursor))throw new Error('Phân trang không tiến triển. Hãy thử xuất lại.');cursor=page.nextCursor;}while(true);
  worker.postMessage({type:'finish'});saveBlob(new Blob([await result],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`SHS-Nhat-ky-CSKH-${new Date().toISOString().slice(0,10)}.xlsx`);
 }finally{worker.terminate();}
}
export async function exportCareErrors(issues:ImportIssue[]){
 const worker=new Worker(new URL('../workers/care-log-export.worker.ts',import.meta.url),{type:'module'});
  try{const buffer=await new Promise<ArrayBuffer>((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.buffer);worker.onerror=e=>reject(new Error(e.message));worker.postMessage({type:'errors',rows:issues.map(x=>[x.row,careColumns.find(c=>c[0]===x.field)?.[1]||x.field,x.value||'',x.message])});});saveBlob(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'SHS-Loi-nhap-nhat-ky.xlsx');}finally{worker.terminate();}
}
