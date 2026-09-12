import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...values: ClassValue[]) => twMerge(clsx(values));
export function formatDate(value: string | null | undefined, time = true) {
 if (!value) return '—';
 return new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(new Date(value));
}
export function localInput(value = new Date().toISOString()) {
 const d = new Date(new Date(value).getTime() + 7 * 3600_000);
 return d.toISOString().slice(0,16);
}
export function fromLocal(value: string) { return new Date(value + ':00+07:00').toISOString(); }
export function dateBoundary(day: string, nextDay = false) {
 if (!day) return null;
 return new Date(new Date(day + 'T00:00:00+07:00').getTime() + (nextDay ? 86400_000 : 0)).toISOString();
}
export function isChunkLoadError(e: unknown) {
 const message = e instanceof Error ? e.message : String(e);
 return /dynamically imported module|loading chunk|importing a module script|module script.*failed/i.test(message);
}
export function errorMessage(e: unknown) {
 const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String(e.message) : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
 if (/foreign key|23503/i.test(message)) return 'Mục này đang được sử dụng. Hãy đổi thông tin liên quan trước khi xóa.';
 if (/duplicate key|23505/i.test(message)) return 'Tên này đã tồn tại. Vui lòng chọn tên khác.';
 if (/row-level security|permission denied/i.test(message)) return 'Tài khoản không có quyền thực hiện thao tác này hoặc đã bị khóa.';
 if (isChunkLoadError(e)) return 'Không tải được chức năng xuất file. Trang có thể đang dùng phiên bản cũ; hãy tải lại trang rồi thử lại.';
 if (/Failed to fetch|fetch failed/i.test(message)) return 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.';
 if (/Invalid login credentials/i.test(message)) return 'Email hoặc mật khẩu chưa đúng.';
 return message;
}
export function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(-2).map(x=>x[0]).join('').toUpperCase(); }
export function processingTime(start: string, end: string | null) {
 if (!end) return 'Chưa hoàn thành';
 const minutes = Math.max(0, Math.round((new Date(end).getTime()-new Date(start).getTime())/60000));
 if (minutes < 60) return `${minutes} phút`;
 if (minutes < 1440) return `${Math.floor(minutes/60)} giờ ${minutes%60} phút`;
 return `${Math.floor(minutes/1440)} ngày ${Math.floor(minutes%1440/60)} giờ`;
}
