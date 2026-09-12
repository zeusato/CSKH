import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'vite';
import ExcelJS from 'exceljs';
import assert from 'node:assert/strict';
const dir = '.local/origin-exports';
await fs.mkdir(dir, { recursive: true });
for (const [entry, name] of [['src/lib/export-pdf.ts', 'pdf'], ['src/workers/excel.worker.ts', 'excel']]) {
 await build({ configFile: false, publicDir: false, logLevel: 'error', build: { ssr: entry, outDir: dir, emptyOutDir: false, rollupOptions: { output: { format: 'cjs', entryFileNames: `${name}.cjs` } } } });
}
// Export synthetic local data through the application's actual PDF exporter.
globalThis.fetch = async input => {
 if (typeof input !== 'string' || !input.startsWith('/')) throw new Error('Only local PDF assets expected');
 return new Response(await fs.readFile(path.join(process.cwd(), 'public', input.slice(1))));
};
const { exportTicketPdf } = await import(pathToFileURL(path.resolve(dir, 'pdf.cjs')).href);
const base = { code: 'CSKH-MAU', title: 'Kiểm tra thông tin nguồn phát sinh trong phiếu ghi nhận', status: 'resolved', received_at: '2026-09-12T02:00:00Z', created_at: '2026-09-12T02:00:00Z', completed_at: '2026-09-12T03:00:00Z', description: 'Nội dung mẫu phục vụ kiểm tra bản in. Không phải dữ liệu khách hàng.', resolution: 'Đã hướng dẫn thao tác và xác nhận hoàn tất.' };
for (const [kind, fields] of [
 ['broker', { broker_name: 'Nguyễn Văn Minh', broker_user: 'mg.minh', broker_department: 'Phòng Môi giới và Tư vấn đầu tư — Chi nhánh Hà Nội' }],
 ['customer', { customer_name: 'Trần Thị Lan', customer_account: '0012345678', customer_broker: 'Nguyễn Văn Minh' }],
]) {
 const pdf = await exportTicketPdf({ ...base, origin: kind, ...fields }, undefined, []);
 await fs.writeFile(`${dir}/${kind}.pdf`, Buffer.from(await pdf.arrayBuffer()));
}
let buffer;
globalThis.self = { postMessage: value => { if (value.error) throw new Error(value.error); buffer = value.buffer; } };
await import(pathToFileURL(path.resolve(dir, 'excel.cjs')).href);
await self.onmessage({ data: { type: 'start', filters: {} } });
await self.onmessage({ data: { type: 'rows', rows: [[base.code, base.title, base.description, base.resolution, 'Đã xử lý', base.received_at, base.created_at, base.completed_at, '', '', '', '', '', base.created_at, 0, 'Khách hàng', '', '', '', 'Trần Thị Lan', '0012345678', '=MG mẫu']] } });
await self.onmessage({ data: { type: 'finish' } });
await fs.writeFile(`${dir}/customer.xlsx`, Buffer.from(buffer));
const book = new ExcelJS.Workbook(); await book.xlsx.load(buffer);
const sheet = book.getWorksheet('Ticket 1');
assert.equal(sheet.getCell('U2').value, '0012345678');
assert.equal(sheet.getCell('V2').value, "'=MG mẫu");
assert.equal(sheet.getCell('P2').value, 'Khách hàng');
assert.equal(sheet.getCell('U1').value, 'Số TK');
assert.ok(sheet.getCell('F2').value instanceof Date);
console.log('PDF broker/customer generated locally. Excel passed: source, 22 columns, leading zeros, formula escaping and dates.');
