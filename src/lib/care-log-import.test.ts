import {describe,it,expect} from 'vitest';
import ExcelJS from 'exceljs';
import {createCareTemplate,readCareWorkbook,checkCareArchive} from './care-log-workbook';
import {normalizeCareRows,parseCareDate,careImportDateLabel,careColumns,type ParsedCareFile} from './care-log-import';
import {careAccess} from './care-log-types';
import {formatDate,fromLocal} from './utils';
import type {Catalogs,Profile} from './types';
const department={id:'00000000-0000-0000-0000-000000000001',name:'CSKH',created_at:'',created_by:null};
const person={...department,id:'00000000-0000-0000-0000-000000000002',name:'Nguyễn An',department_id:department.id};
const catalogs:Catalogs={departments:[department],staff:[person],systems:[{...department,name:'SH Smart APP'}],categories:[],app_users:[]};
const base=['Hỗ trợ','Khách cần hướng dẫn đăng nhập','SH Smart APP','', 'CSKH','Nguyễn An','','','Đã hướng dẫn','Đã xử lý','17/09/2026 09:30','17/09/2026 10:00','Ghi chú','001234567890123456'];
async function workbook(){const buffer=await createCareTemplate(catalogs);const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);return book;}
async function parse(book:ExcelJS.Workbook){const bytes=new Uint8Array(await book.xlsx.writeBuffer());return readCareWorkbook(bytes.buffer);}
function raw(values=base):ParsedCareFile{return {raw:[{row:2,values:Object.fromEntries(careColumns.map(([key],i)=>[key,values[i]]))}],errors:[],warnings:[],blankRows:0,hiddenRows:0,otherSheets:[]};}
describe('Care log dates and catalogs',()=>{
 it('keeps account/user identifiers as optional text and enforces their length',()=>{
  expect(normalizeCareRows(raw(),catalogs).rows[0].account_user).toBe('001234567890123456');
  const values=[...base];values[13]='  user.name@shs  ';
  expect(normalizeCareRows(raw(values),catalogs).rows[0].account_user).toBe('user.name@shs');
  values[13]='';expect(normalizeCareRows(raw(values),catalogs).rows[0].account_user).toBe('');
  values[13]='a'.repeat(256);expect(normalizeCareRows(raw(values),catalogs).errors).toContainEqual(expect.objectContaining({field:'account_user'}));
 });
 it('interprets short day/month input literally and requires an explicit year',()=>{
  expect(parseCareDate('12/8/2026').value).toBe('2026-08-11T17:00:00.000Z');
  expect(careImportDateLabel('12/8/2026')).toBe('12/08/2026');
  expect(careImportDateLabel('8/12/2026')).toBe('08/12/2026');
  for(const value of ['12/8','31/4/2026','2/29/2026'])expect(()=>parseCareDate(value)).toThrow();
 });
 it('uses Vietnam time regardless of local timezone, rejects impossible dates',()=>{expect(parseCareDate('17/09/2026 09:30').value).toBe('2026-09-17T02:30:00.000Z');expect(parseCareDate('17/09/2026')).toEqual({value:'2026-09-16T17:00:00.000Z',dateOnly:true});for(const text of ['31/02/2026','09/17/2026','17/09/2026 25:10'])expect(()=>parseCareDate(text)).toThrow();});
 it('maps catalog names without inventing IDs and preserves long text',()=>{const result=normalizeCareRows(raw(),catalogs);expect(result.errors).toEqual([]);expect(result.rows[0]).toMatchObject({system_id:department.id,receiving_staff_id:person.id,received_at:'2026-09-17T02:30:00.000Z'});});
 it('explains staff department mismatches and how to fix conflicting completion dates',()=>{
  const actual={...department,id:'other-department',name:'Chuyển đổi Số'};
  const values=[...base];values[6]='CSKH';values[7]=person.name;values[9]='Tiếp nhận';values[10]='15/09/2026';values[11]='17/09/2026';
  const result=normalizeCareRows(raw(values),{...catalogs,departments:[department,actual],staff:[{...person,department_id:actual.id}]});
  expect(result.rows).toHaveLength(0);expect(result.errors).toHaveLength(3);
  for(const field of ['receiving_staff_id','coordinating_staff_id'])expect(result.errors.find(x=>x.field===field)).toMatchObject({row:2,message:expect.stringContaining('thuộc Chuyển đổi Số, không thuộc CSKH')});
  expect(result.errors.find(x=>x.field==='completed_at')?.message).toContain('Xóa ngày hoàn thành, hoặc chọn “Đã xử lý”');
 });
 it('accepts dd/mm/yyyy without date-only warnings and keeps legacy time values',()=>{
  const values=[...base];values[10]='15/09/2026';values[11]='17/09/2026';const result=normalizeCareRows(raw(values),catalogs);
  expect(result.errors).toEqual([]);expect(result.warnings).toEqual([]);expect(result.rows[0].received_at).toBe('2026-09-14T17:00:00.000Z');
  expect(careImportDateLabel('17/09/2026 09:30')).toBe('17/09/2026');expect(careImportDateLabel('31/02/2026')).toBe('31/02/2026');
  expect(parseCareDate('17/09/2026 09:30').value).toBe('2026-09-17T02:30:00.000Z');
 });
 it('reports an invalid date once with its exact Excel field',()=>{const values=[...base];values[10]='2026-09-17';const result=normalizeCareRows(raw(values),catalogs);expect(result.errors.filter(x=>x.field==='received_at')).toEqual([{row:2,field:'received_at',message:expect.stringContaining('dd/mm/yyyy')}]);});
 it('rejects ambiguous names, missing departments and incorrect status times',()=>{const ambiguous={...catalogs,staff:[person,{...person,id:'other'}]};expect(normalizeCareRows(raw(),ambiguous).errors.some(x=>x.field==='receiving_staff_id')).toBe(true);const values=[...base];values[4]='Không tồn tại';values[11]='16/09/2026 10:00';const result=normalizeCareRows(raw(values),catalogs);expect(result.rows).toHaveLength(0);expect(result.errors.map(x=>x.field)).toEqual(expect.arrayContaining(['receiving_department_id','receiving_staff_id','completed_at']));});
 it('does not silently trim oversized Excel cells or accept missing descriptions',()=>{const values=[...base];values[1]='x'.repeat(32768);expect(normalizeCareRows(raw(values),catalogs).errors.some(x=>x.field==='description')).toBe(true);values[1]=' ';expect(normalizeCareRows(raw(values),catalogs).rows).toHaveLength(0);});
 it('gates care access separately from ticket access',()=>{const p={role:'user',active:true} as Profile;expect(careAccess(p)).toBe('none');expect(careAccess({...p,care_log_access:'write'})).toBe('write');expect(careAccess({...p,role:'viewer',care_log_access:'write'})).toBe('none');expect(careAccess({...p,role:'admin'})).toBe('write');expect(careAccess({...p,role:'admin',active:false})).toBe('none');});
});
describe('Real XLSX template and parsing',()=>{
 it('preserves account text in the new template and accepts legacy templates',async()=>{
  const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;
  expect(sheet.getCell('N1').text).toBe('Số tài khoản/user');
  expect(sheet.getCell('N2').numFmt).toBe('@');expect(sheet.getCell('N1001').numFmt).toBe('@');
  sheet.getRow(2).values=base;
  expect(normalizeCareRows(await parse(book),catalogs).rows[0].account_user).toBe('001234567890123456');
  sheet.getCell('N1').value=null;sheet.getCell('N2').value=null;
  const legacy=normalizeCareRows(await parse(book),catalogs);
  expect(legacy.errors).toEqual([]);expect(legacy.rows[0].account_user).toBe('');
 });
 it('rejects numeric account cells that may have lost leading zeroes or precision',async()=>{
  const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;sheet.getRow(2).values=base;
  sheet.getCell('N2').value=123456;
  expect((await parse(book)).errors).toContainEqual(expect.objectContaining({row:2,field:'account_user',message:expect.stringContaining('Text')}));
 });
 it('round-trips the reported 12/8 date literally in the text template',async()=>{
  const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;sheet.getRow(2).values=base;
  sheet.getCell('K2').value='12/8/2026';sheet.getCell('L2').value='12/8/2026';
  const parsed=await parse(book),result=normalizeCareRows(parsed,catalogs);
  expect(result.errors).toEqual([]);
  expect(result.rows[0].received_at).toBe('2026-08-11T17:00:00.000Z');
  expect(result.rows[0].completed_at).toBe(result.rows[0].received_at);
 });
 for(const date1904 of [false,true])for(const cellType of ['text','date','serial'] as const)it(`preserves ambiguous day/month values through XLSX import (${cellType}, date1904=${date1904})`,async()=>{
  const book=await workbook();book.properties.date1904=date1904;const sheet=book.getWorksheet('Du lieu')!;
  const cases=[{label:'12/08/2026',iso:'2026-08-12'},{label:'08/12/2026',iso:'2026-12-08'},{label:'05/10/2026',iso:'2026-10-05'},{label:'10/05/2026',iso:'2026-05-10'},{label:'13/10/2026',iso:'2026-10-13'}];
  cases.forEach(({label,iso},index)=>{
   const row=sheet.getRow(index+2);row.values=base;
   for(const column of [11,12]){
    const cell=row.getCell(column);cell.numFmt='dd/mm/yyyy';
    cell.value=cellType==='text'?label:cellType==='date'?new Date(`${iso}T00:00:00Z`):Date.parse(`${iso}T00:00:00Z`)/86400000+25569-(date1904?1462:0);
   }
  });
  const parsed=await parse(book),result=normalizeCareRows(parsed,catalogs);
  expect(result.errors).toEqual([]);expect(result.rows).toHaveLength(cases.length);
  cases.forEach(({label,iso},index)=>{
   for(const field of ['received_at','completed_at'] as const){
    expect(parsed.raw[index].values[field]).toBe(label);
    expect(result.rows[index][field]).toBe(fromLocal(`${iso}T00:00`));
    expect(formatDate(result.rows[index][field],false)).toBe(label);
   }
  });
 });
 it('creates an empty, versioned template and imports 14 fields',async()=>{const book=await workbook();await expect(parse(book)).rejects.toThrow('chưa có dòng');book.getWorksheet('Du lieu')!.getRow(2).values=base;const parsed=await parse(book);expect(parsed.raw).toHaveLength(1);expect(parsed.errors).toEqual([]);expect(normalizeCareRows(parsed,catalogs).rows).toHaveLength(1);});
 it('keeps template date columns as text and still reads native Excel dates',async()=>{const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;for(const address of ['K2','L2','K1001','L1001'])expect(sheet.getCell(address).numFmt).toBe('@');sheet.getRow(2).values=base;sheet.getCell('K2').numFmt='dd/mm/yyyy';sheet.getCell('L2').numFmt='dd/mm/yyyy';sheet.getCell('K2').value=new Date('2026-09-15T00:00:00Z');sheet.getCell('L2').value=new Date('2026-09-17T00:00:00Z');const parsed=await parse(book);expect(parsed.raw[0].values.received_at).toBe('15/09/2026');expect(parsed.raw[0].values.completed_at).toBe('17/09/2026');expect(normalizeCareRows(parsed,catalogs).warnings).toEqual([]);});
 it('maps reordered headers, counts hidden rows and keeps original row numbers',async()=>{const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;sheet.getRow(1).values=[...careColumns].reverse().map(x=>x[1]);sheet.getRow(4).values=[...base].reverse();sheet.getRow(4).hidden=true;const parsed=await parse(book);expect(parsed.hiddenRows).toBe(1);expect(parsed.raw[0].row).toBe(4);expect(parsed.raw[0].values.description).toBe(base[1]);});
 it('rejects duplicate/missing headers and unsupported template versions',async()=>{const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;sheet.getCell('B1').value=sheet.getCell('A1').value;await expect(parse(book)).rejects.toThrow('bị lặp');book.getWorksheet('_meta')!.getCell('B1').value='999';await expect(parse(book)).rejects.toThrow('phiên bản');});
 it('rejects formulas and merged cells with exact row errors',async()=>{const book=await workbook(),sheet=book.getWorksheet('Du lieu')!;sheet.getRow(2).values=base;sheet.getCell('B2').value={formula:'1+1',result:2};sheet.mergeCells('G2:H2');const parsed=await parse(book);expect(parsed.errors).toEqual(expect.arrayContaining([expect.objectContaining({row:2,field:'description',message:expect.stringContaining('công thức')}),expect.objectContaining({row:2,field:'coordinating_department_id',message:expect.stringContaining('ô gộp')})]));});
 for(const date1904 of [false,true])it(`reads true Excel dates with date1904=${date1904}`,async()=>{const book=await workbook();book.properties.date1904=date1904;const sheet=book.getWorksheet('Du lieu')!;sheet.getRow(2).values=base;sheet.getCell('K2').numFmt='dd/mm/yyyy';sheet.getCell('L2').numFmt='dd/mm/yyyy';sheet.getCell('K2').value=new Date('2026-09-17T09:30:00.000Z');sheet.getCell('L2').value=new Date('2026-09-17T10:00:00.000Z');const result=normalizeCareRows(await parse(book),catalogs);expect(result.errors).toEqual([]);expect(result.rows[0].received_at).toBe('2026-09-17T02:30:00.000Z');});
 it('blocks oversized decompressed ZIP before parsing XML',async()=>{const buffer=await createCareTemplate(catalogs);const bytes=new Uint8Array(buffer as unknown as ArrayBuffer);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);for(let i=0;i<bytes.length-46;i++){if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,60*1024*1024,true);break;}}await expect(checkCareArchive(bytes.buffer)).rejects.toThrow('50 MB');});
});
