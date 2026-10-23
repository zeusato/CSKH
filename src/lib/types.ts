import type { TicketOrigin } from './ticket-origin';
export type Status = 'received' | 'in_progress' | 'resolved' | 'cancelled';
export const statuses: Record<Status, string> = { received: 'Tiếp nhận', in_progress: 'Đang xử lý', resolved: 'Đã xử lý', cancelled: 'Đã hủy' };
export type Profile = { id: string; name: string; role: 'admin' | 'user' | 'viewer'; active: boolean; department_id: string | null; created_at: string; email?: string; call_log_access?: 'none'|'own'|'read'|'manage'; care_log_access?: 'none'|'read'|'write'; chat_access?: 'none'|'read'|'agent'|'supervisor'; chat_synced_at?: string|null; chat_sync_error?: string|null };
export type CatalogItem = { id: string; name: string; created_at: string; created_by: string | null; department_id?: string };
export type Catalogs = { categories: CatalogItem[]; systems: CatalogItem[]; departments: CatalogItem[]; staff: CatalogItem[]; app_users: Profile[] };
export type CatalogName = 'categories' | 'systems' | 'departments' | 'staff';
export type Ticket = TicketOrigin & {
 id: string; number: number; code: string; created_at: string; received_at: string; title: string; description: string; resolution: string;
 status: Status; completed_at: string | null; updated_at: string; created_by: string | null; updated_by: string | null; version: number;
 category_id: string | null; system_id: string | null; department_id: string | null; staff_id: string | null;
};
export type TicketRow = Pick<Ticket,'id'|'code'|'title'|'status'|'received_at'|'created_at'|'completed_at'|'updated_at'|'version'|'category_id'|'system_id'|'department_id'|'staff_id'> & {
 description_excerpt: string; resolution_excerpt: string; category_name: string | null; system_name: string | null; department_name: string | null; staff_name: string | null;
};
export type Attachment = { id: string; ticket_id: string; name: string; mime_type: string; size: number; path: string; state: 'pending' | 'ready'; created_at: string; url?: string };
export type Cursor = { rank: number; date: string; id: string };
export type SearchPage = { items: TicketRow[]; hasMore: boolean; nextCursor: Cursor | null };
export type Filters = { q: string; status: string; category: string; system: string; department: string; staff: string; from: string; to: string; dateField: string; sort: string };
export const emptyFilters: Filters = { q: '', status: '', category: '', system: '', department: '', staff: '', from: '', to: '', dateField: 'received_at', sort: 'received_at' };
export type TicketInput = TicketOrigin & Pick<Ticket,'title'|'description'|'resolution'|'status'|'received_at'|'category_id'|'system_id'|'department_id'|'staff_id'>;
