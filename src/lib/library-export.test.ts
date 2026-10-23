import {describe,it,expect,vi,beforeEach} from 'vitest';
import ExcelJS from 'exceljs';
import {libraryWorkbook} from './library-workbook';
import type {LibraryEntry} from './library-types';
import {canWriteLibrary} from './library-types';
import type {Profile} from './types';
const entry={id:'one',code:'TV-000001',title:'Hướng dẫn',description:'Mô tả',resolution:'Lời giải',source_type:'ticket',source_id:'deleted',source_code:'CSKH-000001',source_context:{},created_at:'2026-10-23T02:00:00Z',updated_at:'2026-10-23T02:00:00Z',source_received_at:'2026-10-22T02:00:00Z',source_completed_at:null,system_name:'SH Smart App',category_name:'Hỗ trợ'} as LibraryEntry;
const api=vi.hoisted(()=>({searchLibrary:vi.fn(),getLibraryEntry:vi.fn(),getLibraryAttachments:vi.fn()}));
vi.mock('./library-api',()=>api);
describe('Independent library export',()=>{
 it('exports snapshots, Vietnam dates, long text and formula-like text safely',async()=>{
  const report=libraryWorkbook(),long='X'.repeat(70000);report.add([{...entry,title:'=FORMULA()',resolution:long}]);const book=new ExcelJS.Workbook();await book.xlsx.load(await report.finish());const sheet=book.getWorksheet('Thư viện 1')!;
  expect(sheet.getCell('B2').text).toBe("'=FORMULA()");expect(sheet.getCell('I2').text).toContain('09:00');expect(sheet.getCell('F2').text).toBe(entry.source_code);const parts=book.getWorksheet('Nội dung dài')!;expect([2,3,4].map(n=>parts.getCell(n,4).text).join('')).toBe(long);
 });
 it('uses only library pages and honors current filters across export pagination',async()=>{
  api.searchLibrary.mockReset();api.searchLibrary.mockResolvedValueOnce({items:[entry],hasMore:true,nextCursor:{date:entry.created_at,id:entry.id}}).mockResolvedValueOnce({items:[{...entry,id:'two',code:'TV-000002'}],hasMore:false,nextCursor:null});
  const sent:unknown[]=[];class FakeWorker{onmessage:((e:unknown)=>void)|null=null;onerror:unknown;postMessage(data:{type:string}){sent.push(data);if(data.type==='finish')this.onmessage?.({data:{buffer:new ArrayBuffer(1)}});}terminate(){}}
  vi.stubGlobal('Worker',FakeWorker);vi.stubGlobal('document',{createElement:()=>({click(){}})});vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:library-test');vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});vi.useFakeTimers();
  try{const {exportLibraryExcel}=await import('./library-export');const filters={q:'tra soát',source_type:'care_log',system:'',category:'',from:'',to:''};await exportLibraryExcel(filters);expect(api.searchLibrary).toHaveBeenCalledTimes(2);expect(api.searchLibrary.mock.calls[1][0]).toEqual(filters);expect(sent.filter((x:any)=>x.type==='rows')).toHaveLength(2);expect(api.getLibraryEntry).not.toHaveBeenCalled();}finally{vi.runAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();}
 });
 it('keeps write permission source-scoped and excludes inactive and read-only accounts',()=>{
  const p={active:true,role:'user',care_log_access:'none'} as Profile;
  expect(canWriteLibrary(p,'ticket')).toBe(true);expect(canWriteLibrary(p,'care_log')).toBe(false);expect(canWriteLibrary({...p,care_log_access:'write'},'care_log')).toBe(true);expect(canWriteLibrary({...p,role:'viewer'},'ticket')).toBe(false);expect(canWriteLibrary({...p,role:'admin',active:false},'care_log')).toBe(false);
 });
});
