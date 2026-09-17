import { supabase } from './supabase';
import { dateBoundary } from './utils';
import type { Cursor } from './types';
import type { CareLog,CareLogInput,CareFilters,CareBatch,ImportRow,ImportValidation,ImportResult } from './care-log-types';
export async function searchCareLogs(filters:CareFilters,cursor:Cursor|null=null,signal?:AbortSignal,limit=30,cutoff?:string) {
 let query=supabase.rpc('search_care_logs',{p_filters:{...filters,from:dateBoundary(filters.from),to:dateBoundary(filters.to,true)},p_cursor:cursor,p_limit:limit,p_cutoff:cutoff||null});
 if(signal)query=query.abortSignal(signal);const {data,error}=await query;if(error)throw error;
 return data as {items:CareLog[];hasMore:boolean;nextCursor:Cursor|null};
}
export async function getCareLog(id:string){const {data,error}=await supabase.from('care_logs').select('*').eq('id',id).single();if(error)throw error;return data as CareLog;}
export async function saveCareLog(input:CareLogInput,previous?:CareLog){
 const query=previous?supabase.from('care_logs').update(input).eq('id',previous.id).eq('version',previous.version):supabase.from('care_logs').insert(input);
 const {data,error}=await query.select('id').maybeSingle();if(error)throw error;if(!data)throw new Error('Bản ghi đã thay đổi hoặc quyền đã bị thu hồi. Nội dung đang nhập được giữ; hãy mở bản mới ở tab khác để đối chiếu.');return data.id as string;
}
export async function deleteCareLog(previous:CareLog){const {data,error}=await supabase.from('care_logs').delete().eq('id',previous.id).eq('version',previous.version).select('id');if(error)throw error;if(!data?.length)throw new Error('Bản ghi đã thay đổi. Hãy tải lại trước khi xóa.');}
export async function careCounts(){const {data,error}=await supabase.rpc('care_log_counts');if(error)throw error;return data as Record<string,number>;}
export async function careBatches(){const {data,error}=await supabase.rpc('care_log_import_batches');if(error)throw error;return data as CareBatch[];}
export async function validateCareImport(rows:ImportRow[]){const {data,error}=await supabase.rpc('validate_care_log_import',{p_rows:rows});if(error)throw error;return data as ImportValidation;}
export async function commitCareImport(rows:ImportRow[],requestId:string,fileName:string,token:string){const {data,error}=await supabase.rpc('commit_care_log_import',{p_rows:rows,p_request_id:requestId,p_file_name:fileName.slice(0,240),p_token:token,p_template_version:'1'});if(error)throw error;return data as ImportResult|{review:ImportValidation};}
export async function getCareImportResult(requestId:string){const {data,error}=await supabase.rpc('get_care_log_import_result',{p_request_id:requestId});if(error)throw error;return data as ImportResult|null;}
