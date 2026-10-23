import type {Profile} from './types';
export const callAccessLabels={none:'Không truy cập',own:'Nhân viên (dữ liệu của mình)',read:'Chỉ xem toàn bộ',manage:'Quản lý toàn bộ'};
export type CallAccess=keyof typeof callAccessLabels;
export function callAccess(p:Profile|null):CallAccess {if(!p?.active)return 'none';if(p.role==='admin')return 'manage';if(p.role==='viewer')return p.call_log_access==='read'?'read':'none';return p.call_log_access||'none';}
export const callStatuses={connected:'Đã kết nối',no_answer:'Không nghe máy',busy:'Máy bận',unreachable:'Không liên lạc được',wrong_number:'Sai số'};
export const followupStatuses={pending:'Cần thực hiện',done:'Đã hoàn thành',cancelled:'Đã hủy'};
export type FollowupInput={action:string;due_at:string;assignee_id:string;status:keyof typeof followupStatuses};
export type Followup=FollowupInput&{call_id:string;version:number;completed_at:string|null;updated_at:string;updated_by:string|null};
export type CallInput={called_at:string;ended_at:string|null;caller_staff_id:string;owner_id:string;customer_name:string;phone:string;account_number:string;nav:string|null;purpose_id:string;status:keyof typeof callStatuses;notes:string;previous_call_id:string|null;followup:FollowupInput|null};
export type CallLog=Omit<CallInput,'nav'|'followup'>&{nav:number|string|null;followup:Followup|null;id:string;code:string;version:number;created_at:string;created_by:string;updated_at:string;updated_by:string;import_batch_id:string|null};
export type CallPurpose={id:string;name:string;active:boolean};
export type CallFilters={q:string;from:string;to:string;caller_staff_id:string;owner_id:string;purpose_id:string;status:string;nav_min:string;nav_max:string;assignee_id:string;followup:string;customer_account?:string;customer_phone?:string;id?:string;cutoff?:string};
export const emptyCallFilters:CallFilters={q:'',from:'',to:'',caller_staff_id:'',owner_id:'',purpose_id:'',status:'',nav_min:'',nav_max:'',assignee_id:'',followup:''};
export type CallCursor={date:string;id:string};
export type CallPage={items:CallLog[];total:number;hasMore:boolean;nextCursor:CallCursor|null};
export type CallStats={totals:{total:number;connected:number;customers:number;duration_seconds:number;average_seconds:number|null;pending:number;overdue:number;due_today:number;done:number};groups:{label:string;total:number;connected:number}[]};
export type CallImportRow=CallInput&{row:number};
export type CallImportReview={errors:{row:number|string;message:string}[];warnings:{row:number|string;message:string}[];token:string};
export function callInput(c:CallLog):CallInput {return {called_at:c.called_at,ended_at:c.ended_at,caller_staff_id:c.caller_staff_id,owner_id:c.owner_id,customer_name:c.customer_name,phone:c.phone,account_number:c.account_number,nav:c.nav===null?null:String(c.nav),purpose_id:c.purpose_id,status:c.status,notes:c.notes,previous_call_id:c.previous_call_id,followup:c.followup?{action:c.followup.action,due_at:c.followup.due_at,assignee_id:c.followup.assignee_id,status:c.followup.status}:null};}
export function durationLabel(seconds:number|null){if(seconds===null)return '—';const n=Math.round(seconds);return `${Math.floor(n/60)} phút ${n%60} giây`;}
export function canEditCall(c:CallLog,p:Profile|null){return callAccess(p)==='manage'||(callAccess(p)==='own'&&c.owner_id===p?.id);}
