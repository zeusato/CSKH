import type { Profile, Status } from './types';
export type CareAccess = 'none' | 'read' | 'write';
export const careAccessLabels = {none:'Không truy cập',read:'Chỉ xem',write:'Chỉnh sửa'};
export function careAccess(profile: Profile | null): CareAccess {
 if (!profile?.active) return 'none';
 if (profile.role === 'admin') return 'write';
 if (profile.role === 'viewer') return profile.care_log_access === 'read' ? 'read' : 'none';
 return profile.care_log_access || 'none';
}
export const requestTypes = {support:'Hỗ trợ',complaint:'Khiếu nại',feedback:'Ý kiến đóng góp'};
export type CareLogInput = {
 request_type: keyof typeof requestTypes; description: string; response_content: string; notes: string; account_user: string;
 system_id: string | null; category_id: string | null; receiving_department_id: string;
 receiving_staff_id: string | null; coordinating_department_id: string | null; coordinating_staff_id: string | null;
 status: Status; received_at: string; completed_at: string | null;
};
export type CareLog = CareLogInput & {id:string;code:string;created_at:string;created_by:string|null;updated_at:string;updated_by:string|null;version:number;entry_source:'manual'|'excel_import';import_batch_id:string|null;import_row_number:number|null};
export type CareFilters = {q:string;status:string;request_type:string;system_id:string;category_id:string;receiving_department_id:string;receiving_staff_id:string;coordinating_department_id:string;coordinating_staff_id:string;from:string;to:string;dateField:string;sort:string;import_batch_id:string};
export const emptyCareFilters: CareFilters = {q:'',status:'',request_type:'',system_id:'',category_id:'',receiving_department_id:'',receiving_staff_id:'',coordinating_department_id:'',coordinating_staff_id:'',from:'',to:'',dateField:'received_at',sort:'received_at',import_batch_id:''};
export type ImportRow = CareLogInput & {row:number};
export type ImportIssue = {row:number;field:string;message:string;id?:string;value?:string};
export type ImportValidation = {errors:ImportIssue[];warnings:ImportIssue[];token:string};
export type ImportResult = {id:string;count:number;replayed?:boolean};
export type CareBatch = {id:string;imported_at:string;imported_by:string;file_name:string;row_count:number};
