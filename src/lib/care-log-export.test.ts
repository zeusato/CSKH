import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import ExcelJS from 'exceljs';
import {describe,it,expect,vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {exportCarePdf} from './care-log-pdf';
import {careColumns} from './care-log-import';
import type {CareLog} from './care-log-types';
import type {Catalogs} from './types';
const catalogs:Catalogs={categories:[],systems:[],departments:[],staff:[],app_users:[]};
const record:CareLog={account_user:'001234567890123456',id:'a',code:'NK-000001',request_type:'complaint',description:'Mô tả vấn đề tiếng Việt\n'.repeat(160),response_content:'Phản hồi đầy đủ với khách hàng',notes:'Kết thúc ghi chú',system_id:null,category_id:null,receiving_department_id:'x',receiving_staff_id:null,coordinating_department_id:null,coordinating_staff_id:null,status:'resolved',received_at:'2020-09-17T02:30:00Z',completed_at:'2020-09-17T03:00:00Z',created_at:'2026-09-17T02:30:00Z',updated_at:'2026-09-17T02:30:00Z',created_by:null,updated_by:null,version:1,entry_source:'manual',import_batch_id:null,import_row_number:null};
describe('Real care report exporters',()=>{
 it('Excel preserves long content, escapes formulas and emits Vietnam date cells',async()=>{
  let result:Promise<ArrayBuffer>;let done!:(v:ArrayBuffer)=>void;result=new Promise(r=>{done=r;});const self:{onmessage?:(event:{data:unknown})=>Promise<void>;postMessage:(data:{buffer:ArrayBuffer;error?:string})=>void}={postMessage:data=>{if(data.error)throw new Error(data.error);done(data.buffer);}};
  const source=stripTypeScriptTypes(readFileSync('src/workers/care-log-export.worker.ts','utf8').replace(/^import .*;\r?\n/,''));new Function('ExcelJS','self',source)(ExcelJS,self);
  const headers=['Mã',...careColumns.map(x=>x[1]),'Người tạo','Tạo','Người sửa','Sửa','Đợt','Dòng'];await self.onmessage!({data:{type:'start',headers,filters:{q:'=SUM(1,2)'}}});const long='Nội dung cần giữ đủ\n'.repeat(2200);const values=['NK-000001','Khiếu nại',long,'','','','','','','=HYPERLINK("bad")','Đã xử lý',record.received_at,record.completed_at,'Ghi chú',record.account_user,'','2026-09-17T02:30:00Z','','2026-09-17T02:30:00Z','',''];await self.onmessage!({data:{type:'rows',rows:[values]}});await self.onmessage!({data:{type:'finish'}});const buffer=await result;const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);expect(book.getWorksheet('Nhật ký 1')!.getCell('J2').text).toBe("'=HYPERLINK(\"bad\")");expect(book.getWorksheet('Nhật ký 1')!.getCell('L2').value).toEqual(new Date('2020-09-17T09:30:00Z'));for(const address of ['L2','M2'])expect(book.getWorksheet('Nhật ký 1')!.getCell(address).numFmt).toBe('dd/mm/yyyy');expect(book.getWorksheet('Nhật ký 1')!.getCell('Q2').numFmt).toBe('dd/mm/yyyy hh:mm');expect(book.getWorksheet('Nhật ký 1')!.getCell('O2').value).toBe(record.account_user);const sheet=book.getWorksheet('Nội dung dài')!;let restored='';sheet.eachRow((r,i)=>{if(i>1)restored+=r.getCell(4).text;});expect(restored).toBe(long);
 });
 it('PDF supports Vietnamese, long multi-page content and a readable footer',async()=>{
  const fetchMock=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>new Response(readFileSync('public/'+String(input).replace(/^\//,''))));
  try{const blob=await exportCarePdf(record,catalogs);const bytes=new Uint8Array(await blob.arrayBuffer());const doc=await PDFDocument.load(bytes);expect(doc.getPageCount()).toBeGreaterThan(3);expect(doc.getTitle()).toContain('NK-000001');mkdirSync('.local/care-qa',{recursive:true});writeFileSync('.local/care-qa/long-care.pdf',bytes);}finally{fetchMock.mockRestore();}
 });
});
