import { supabase } from './supabase';
import { originColumns } from './ticket-origin';
import { compareCatalogItems } from './catalog-order';
import { compressImage, IMAGE_COMPRESSION_THRESHOLD } from './compress-image';
import { dateBoundary } from './utils';
import type { Attachment, Catalogs, Cursor, Filters, SearchPage, Ticket, TicketInput } from './types';
export async function getCatalogs(signal?: AbortSignal): Promise<Catalogs> {
 const names = ['categories','systems','departments','staff','app_users'] as const;
 const results = await Promise.all(names.map(async name => {
  const all:unknown[]=[];let offset=0;
  while(true){let request=supabase.from(name).select('*').order('name').order('id').range(offset,offset+999);if(signal)request=request.abortSignal(signal);const {data,error}=await request;if(error)throw error;all.push(...data);if(data.length<1000)break;offset+=1000;}
  if(name==='systems') (all as Catalogs['systems']).sort((a,b)=>compareCatalogItems(name,a,b));
  return [name,all];
 }));
 return Object.fromEntries(results) as Catalogs;
}
export function searchArgs(filters: Filters, cursor: Cursor | null = null, limit = 30, cutoff?: string) {
 return { p_query: filters.q, p_status: filters.status || null, p_category: filters.category || null, p_system: filters.system || null,
  p_department: filters.department || null, p_staff: filters.staff || null, p_from: dateBoundary(filters.from), p_to: dateBoundary(filters.to,true),
  p_date_field: filters.dateField, p_sort: filters.sort, p_cursor: cursor, p_limit: limit, p_cutoff: cutoff || null };
}
export async function searchTickets(filters: Filters, cursor: Cursor | null = null, signal?: AbortSignal): Promise<SearchPage> {
 let request = supabase.rpc('search_tickets',searchArgs(filters,cursor)); if(signal)request=request.abortSignal(signal);
 const {data,error}=await request; if(error)throw error; return data;
}
export async function getTicket(id: string): Promise<Ticket> {
 const {data,error}=await supabase.from('tickets').select(`id,number,code,created_at,received_at,title,description,resolution,status,completed_at,updated_at,created_by,updated_by,version,category_id,system_id,department_id,staff_id,${originColumns}`).eq('id',id).single();
 if(error)throw error; return data as unknown as Ticket;
}
export async function saveTicket(input: TicketInput, previous?: Ticket) {
 const request = previous ? supabase.from('tickets').update(input).eq('id',previous.id).eq('version',previous.version) : supabase.from('tickets').insert(input);
 const {data,error} = await request.select('id,version').maybeSingle();
 if(error)throw error; if(!data)throw new Error('Ticket đã được người khác cập nhật. Đóng biểu mẫu, tải lại ticket rồi nhập thay đổi của bạn.');
 return data as {id:string;version:number};
}
export async function getAttachments(id: string): Promise<Attachment[]> {
 const {data,error}=await supabase.from('ticket_attachments').select('*').eq('ticket_id',id).order('created_at'); if(error)throw error;
 return Promise.all((data as Attachment[]).map(async item=>{
  if(item.state!=='ready')return item;
  const signed=await supabase.storage.from('ticket-images').createSignedUrl(item.path,300);
  return {...item,url:signed.data?.signedUrl};
 }));
}
export async function uploadImage(ticketId: string, original: File, onStage?: (stage: 'compressing' | 'uploading') => void) {
 if (!['image/png','image/jpeg','image/webp'].includes(original.type) || original.size===0 || original.size>10485760) throw new Error('Ảnh cần ở định dạng PNG, JPG hoặc WebP, tối đa 10 MB.');
 if (original.size > IMAGE_COMPRESSION_THRESHOLD) onStage?.('compressing');
 const file = await compressImage(original);
 onStage?.('uploading');
 const id=crypto.randomUUID(); const path=`${ticketId}/${id}`;
 const meta=await supabase.from('ticket_attachments').insert({id,ticket_id:ticketId,name:file.name.slice(0,240),mime_type:file.type,size:file.size,path}).select().single();
 if(meta.error)throw meta.error;
 try {
  const upload=await supabase.storage.from('ticket-images').upload(path,file,{contentType:file.type,upsert:false}); if(upload.error)throw upload.error;
  const ready=await supabase.from('ticket_attachments').update({state:'ready'}).eq('id',id); if(ready.error)throw ready.error;
  return {originalBytes:original.size,storedBytes:file.size};
 } catch(e) { await supabase.from('ticket_attachments').delete().eq('id',id); void runCleanup(); throw e; }
}
export async function removeAttachment(id: string) {
 const {error}=await supabase.from('ticket_attachments').delete().eq('id',id); if(error)throw error; void runCleanup();
}
export async function deleteTicket(ticket: Ticket) {
 const {data,error}=await supabase.from('tickets').delete().eq('id',ticket.id).eq('version',ticket.version).select('id');
 if(error)throw error;if(!data?.length)throw new Error('Ticket đã thay đổi. Tải lại trước khi xóa.');void runCleanup();
}
export async function runCleanup() { await supabase.functions.invoke('storage-cleanup',{body:{}}); }
export async function adminAction(action: string, payload: Record<string,unknown> = {}) {
 const {data,error}=await supabase.functions.invoke('admin-users',{body:{action,...payload}});
 if(error){ let detail; try{detail=await error.context?.json();}catch{/* SDK error without JSON */}throw new Error(detail?.error || error.message); }
 if(data.error)throw new Error(data.error);return data;
}
