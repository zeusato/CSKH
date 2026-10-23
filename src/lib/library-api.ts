import {supabase} from './supabase';
import {runCleanup} from './api';
import {dateBoundary} from './utils';
import type {LibraryAttachment,LibraryCursor,LibraryEntry,LibraryFilters,LibraryInput,LibrarySource} from './library-types';
export async function searchLibrary(filters:LibraryFilters,cursor:LibraryCursor|null=null,signal?:AbortSignal,limit=30,cutoff?:string){
 let request=supabase.rpc('search_library',{p_filters:{...filters,from:dateBoundary(filters.from),to:dateBoundary(filters.to,true)},p_cursor:cursor,p_limit:limit,p_cutoff:cutoff||null});
 if(signal)request=request.abortSignal(signal);const {data,error}=await request;if(error)throw error;
 return data as {items:LibraryEntry[];total:number;hasMore:boolean;nextCursor:LibraryCursor|null};
}
export async function getLibraryEntry(id:string,signal?:AbortSignal){
 let request=supabase.from('library_entries').select('*').eq('id',id);if(signal)request=request.abortSignal(signal);
 const {data,error}=await request.single();if(error)throw error;return data as LibraryEntry;
}
export async function findLibraryEntry(source:LibrarySource,id:string,signal?:AbortSignal){
 let request=supabase.from('library_entries').select('id').eq('source_type',source).eq('source_id',id);if(signal)request=request.abortSignal(signal);
 const {data,error}=await request.maybeSingle();if(error)throw error;return data?.id as string|undefined;
}
export async function saveToLibrary(source:LibrarySource,id:string,version:number,input:LibraryInput){
 const {data,error}=await supabase.rpc('save_to_library',{p_source_type:source,p_source_id:id,p_source_version:version,p_title:input.title,p_description:input.description,p_resolution:input.resolution});
 if(error)throw error;if(!data)throw new Error('Chưa xác nhận được bài đã lưu. Hãy thử lại.');return data as string;
}
export async function updateLibraryEntry(entry:LibraryEntry,input:LibraryInput){
 const {data,error}=await supabase.from('library_entries').update({title:input.title,description:input.description,resolution:input.resolution}).eq('id',entry.id).eq('version',entry.version).select('id').maybeSingle();
 if(error)throw error;if(!data)throw new Error('Bài đã thay đổi hoặc quyền đã bị thu hồi. Hãy tải lại trước khi sửa.');
}
export async function deleteLibraryEntry(entry:LibraryEntry){
 const {data,error}=await supabase.from('library_entries').delete().eq('id',entry.id).eq('version',entry.version).select('id').maybeSingle();
 if(error)throw error;if(!data)throw new Error('Bài đã thay đổi hoặc quyền đã bị thu hồi. Hãy tải lại trước khi xóa.');void runCleanup();
}
export async function getLibraryAttachments(id:string,signal?:AbortSignal):Promise<LibraryAttachment[]>{
 let request=supabase.from('library_attachments').select('*').eq('entry_id',id).order('created_at');if(signal)request=request.abortSignal(signal);
 const {data,error}=await request;if(error)throw error;
 return Promise.all((data as LibraryAttachment[]).map(async item=>{const signed=await supabase.storage.from('ticket-images').createSignedUrl(item.path,300);return {...item,url:signed.data?.signedUrl};}));
}
