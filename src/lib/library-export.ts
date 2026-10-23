import {getLibraryAttachments,getLibraryEntry,searchLibrary} from './library-api';
import {librarySourceLabels,type LibraryCursor,type LibraryFilters} from './library-types';
import {formatDate} from './utils';
function download(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
export async function exportLibraryExcel(filters:LibraryFilters){
 const worker=new Worker(new URL('../workers/library-export.worker.ts',import.meta.url),{type:'module'});
 try{
  let failure:Error|undefined;
  const result=new Promise<ArrayBuffer>((resolve,reject)=>{worker.onmessage=e=>e.data.error?reject(new Error(e.data.error)):resolve(e.data.buffer);worker.onerror=e=>reject(new Error(e.message));});
  void result.catch(e=>{failure=e;});
  let cursor:LibraryCursor|null=null;const cutoff=new Date().toISOString(),seen=new Set<string>();
  do{if(failure)throw failure;const page=await searchLibrary(filters,cursor,undefined,500,cutoff);const items=page.items.filter(e=>!seen.has(e.id));items.forEach(e=>seen.add(e.id));worker.postMessage({type:'rows',items});if(!page.hasMore)break;if(!page.nextCursor||JSON.stringify(cursor)===JSON.stringify(page.nextCursor))throw new Error('Phân trang không tiến triển. Hãy xuất lại.');cursor=page.nextCursor;}while(true);
  worker.postMessage({type:'finish'});download(new Blob([await result],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`SHS-Thu-vien-${new Date().toISOString().slice(0,10)}.xlsx`);
 }finally{worker.terminate();}
}
export async function exportLibraryPdf(id:string){
 const [entry,images,{exportCasePdf}]=await Promise.all([getLibraryEntry(id),getLibraryAttachments(id),import('./export-pdf')]);
 const facts=[['Nguồn',`${librarySourceLabels[entry.source_type]} · ${entry.source_code}`],['Lưu vào thư viện',formatDate(entry.created_at)],['Cập nhật',formatDate(entry.updated_at)],['Hệ thống',entry.system_name||'Chưa ghi nhận'],['Phân mục',entry.category_name||'Chưa ghi nhận'],['Tiếp nhận nguồn',formatDate(entry.source_received_at)],['Hoàn thành nguồn',formatDate(entry.source_completed_at)],...Object.entries(entry.source_context).map(([label,value])=>[label,value||'Chưa ghi nhận'])];
 download(await exportCasePdf(entry,images,facts,'THƯ VIỆN LỜI GIẢI'),`${entry.code}.pdf`);
}
