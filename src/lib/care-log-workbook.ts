import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type {Catalogs} from './types';
import {statuses} from './types';
import {requestTypes} from './care-log-types';
import {careColumns,normalizeName,type ParsedCareFile} from './care-log-import';

export async function checkCareArchive(buffer:ArrayBuffer){
 if(buffer.byteLength>10*1024*1024)throw new Error('File tối đa 10 MB.');
 const view=new DataView(buffer);if(view.byteLength<22||view.getUint32(0,true)!==0x04034b50)throw new Error('File không phải XLSX hợp lệ.');
 let end=-1;for(let i=view.byteLength-22;i>=Math.max(0,view.byteLength-65557);i--){if(view.getUint32(i,true)===0x06054b50){end=i;break;}}
 if(end<0)throw new Error('Cấu trúc XLSX bị hỏng.');
 const count=view.getUint16(end+10,true);let offset=view.getUint32(end+16,true),total=0;
 if(count>2000||count===0||view.getUint16(end+4,true)!==0)throw new Error('Workbook quá phức tạp hoặc không được hỗ trợ.');
 for(let n=0;n<count;n++){
  if(offset+46>view.byteLength||view.getUint32(offset,true)!==0x02014b50)throw new Error('Cấu trúc ZIP không hợp lệ.');
  total+=view.getUint32(offset+24,true);if(total>50*1024*1024)throw new Error('Nội dung giải nén vượt 50 MB.');
  offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
 }
 const zip=await JSZip.loadAsync(buffer);let actual=0;
 for(const entry of Object.values(zip.files)){
  if(entry.dir)continue;
  if(/vbaProject\.bin$/i.test(entry.name))throw new Error('Không hỗ trợ file có macro.');
  if(/^xl\/(media|embeddings)\//i.test(entry.name))throw new Error('Mẫu import chỉ nhận dữ liệu ô, không hỗ trợ ảnh hoặc file nhúng.');
  await new Promise<void>((resolve,reject)=>{
   type ZipStream={on(event:'data',fn:(chunk:Uint8Array)=>void):ZipStream;on(event:'error',fn:(error:Error)=>void):ZipStream;on(event:'end',fn:()=>void):ZipStream;pause():ZipStream;resume():ZipStream};
   const stream=(entry as typeof entry & {internalStream(type:'uint8array'):ZipStream}).internalStream('uint8array');stream.on('data',chunk=>{actual+=chunk.length;if(actual>50*1024*1024){stream.pause();reject(new Error('Nội dung giải nén vượt 50 MB.'));}}).on('error',reject).on('end',resolve).resume();
  });
 }
}
function cellText(cell:ExcelJS.Cell){
 const v=cell.value;if(v===null||v===undefined)return '';
 if(v instanceof Date){if(!Number.isFinite(v.getTime()))throw new Error('Ngày Excel không hợp lệ.');const date=`${String(v.getUTCDate()).padStart(2,'0')}/${String(v.getUTCMonth()+1).padStart(2,'0')}/${v.getUTCFullYear()}`;return v.getUTCHours()||v.getUTCMinutes()?`${date} ${String(v.getUTCHours()).padStart(2,'0')}:${String(v.getUTCMinutes()).padStart(2,'0')}`:date;}
 if(typeof v==='object'){
  if('formula' in v||'sharedFormula' in v)throw new Error('Ô có công thức; hãy dán dưới dạng giá trị.');
  if('richText' in v)return v.richText.map(x=>x.text).join('');
  if('error' in v)throw new Error('Ô Excel chứa lỗi.');
  if('text' in v)return String(v.text);
 }
 return String(v);
}
export async function readCareWorkbook(buffer:ArrayBuffer):Promise<ParsedCareFile>{
 await checkCareArchive(buffer);const book=new ExcelJS.Workbook();await book.xlsx.load(buffer);
 if(book.getWorksheet('_meta')?.getCell('A1').text!=='SHS_CARE_LOGS'||book.getWorksheet('_meta')?.getCell('B1').text!=='1')throw new Error('Sai phiên bản mẫu. Hãy tải mẫu Nhật ký CSKH hiện hành.');
 const sheet=book.getWorksheet('Du lieu');if(!sheet)throw new Error('Thiếu sheet Du lieu.');
 if(sheet.columnCount>100||sheet.rowCount>10001)throw new Error('Vùng dữ liệu quá lớn; xóa các dòng/cột thừa.');
 const result:ParsedCareFile={raw:[],errors:[],warnings:[],blankRows:0,hiddenRows:0,otherSheets:book.worksheets.map(s=>s.name).filter(x=>!['Du lieu','Huong dan','Danh muc','_meta'].includes(x))};
 const mapping=new Map<number,string>();const found=new Set<string>();
 sheet.getRow(1).eachCell({includeEmpty:true},(cell,col)=>{
  const label=normalizeName(cellText(cell));if(!label)return;const match=careColumns.find(([,name])=>normalizeName(name)===label);
  if(!match)throw new Error(`Cột không được hỗ trợ: ${cell.text}`);if(found.has(match[0]))throw new Error(`Cột bị lặp: ${match[1]}`);found.add(match[0]);mapping.set(col,match[0]);
 });
 const missing=careColumns.filter(([key])=>key!=='account_user'&&!found.has(key));if(missing.length)throw new Error(`Thiếu cột: ${missing.map(x=>x[1]).join(', ')}`);
 for(let index=2;index<=sheet.rowCount;index++){
  const source=sheet.getRow(index),values:Record<string,string>={};let hasValue=false;
  source.eachCell({includeEmpty:false},(cell,col)=>{if(cell.value!==null){hasValue=true;if(!mapping.has(col))result.errors.push({row:index,field:`Cột ${col}`,message:'Có dữ liệu ngoài các cột của mẫu.'});}});
  if(!hasValue){result.blankRows++;continue;}if(source.hidden)result.hiddenRows++;
  if(result.raw.length>=1000)throw new Error('Tối đa 1.000 dòng dữ liệu mỗi file.');
  for(const [col,key] of mapping){const cell=source.getCell(col);try{if(cell.isMerged)throw new Error('Không hỗ trợ ô gộp.');if(key==='account_user'&&cell.value!==null&&typeof cell.value!=='string'&&(typeof cell.value!=='object'||cell.value instanceof Date))throw new Error('Số tài khoản/user cần nhập dạng Text để giữ nguyên số 0 đầu và ký tự.');values[key]=cellText(cell).trim();}catch(e){result.errors.push({row:index,field:key,message:(e as Error).message});values[key]='';}}
  result.raw.push({row:index,values});
 }
 if(!result.raw.length)throw new Error('File chưa có dòng dữ liệu.');return result;
}
export async function createCareTemplate(catalogs:Catalogs){
 const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('Du lieu',{views:[{state:'frozen',ySplit:1}]});
 sheet.columns=careColumns.map(([,header])=>({header,width:header.includes('Mô tả')||header.includes('phản hồi')?45:27}));
 // Keep typed dates literal: Excel's input locale can interpret 12/8 as December 8
 // even when a date cell's display format is dd/mm/yyyy.
 for(const column of [11,12,14])sheet.getColumn(column).numFmt='@';
 sheet.getRow(1).height=48;sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB84A07'}};c.alignment={wrapText:true,vertical:'middle'};});sheet.autoFilter='A1:N1';
 const guide=book.addWorksheet('Huong dan');guide.columns=[{width:32},{width:115}];
 guide.addRows([
  ['Nhật ký CSKH','Mẫu v1. Chỉ sheet Du lieu được nhập. Không đổi tên cột; có thể đổi thứ tự cột.'],
  ['Bắt buộc','Phân loại yêu cầu; Mô tả vấn đề; Bộ phận tiếp nhận; Trạng thái xử lý; Thời gian tiếp nhận.'],
  ['Hoàn thành','Đã xử lý phải có thời gian hoàn thành >= tiếp nhận. Trạng thái khác để trống.'],
  ['Ngày tháng','dd/mm/yyyy. Ví dụ: 17/09/2026. Ngày được lưu lúc 00:00 theo giờ Việt Nam; file cũ có giờ vẫn được giữ nguyên giờ khi nhập.'],
  ['Tránh đảo ngày/tháng','Hai cột ngày được đặt dạng Text. Nhập đủ năm, ví dụ 12/8/2026 là ngày 12 tháng 8. Giữ định dạng Text; khi sao chép hãy dán giá trị. Với ô ngày Excel có sẵn, kiểm tra đúng ngày/tháng trên bản xem trước trước khi xác nhận.'],
  ['Kênh phát sinh lỗi','Dùng danh sách Hệ thống liên quan hiện có.'],
  ['Số tài khoản/user','Không bắt buộc, tối đa 255 ký tự. Cột N dạng Text: nhập số tài khoản hoặc user phát sinh vấn đề, giữ nguyên số 0 đầu. Mẫu cũ chưa có cột này vẫn nhập được và để trống tài khoản.'],
  ['Nhân sự','Dùng tên danh bạ thuộc bộ phận tương ứng. Tên trùng phải xử lý trước khi nhập.'],
  ['Phạm vi','Chỉ tạo mới. Dòng ẩn/filter vẫn được nhập; không hỗ trợ công thức, ô gộp hoặc ảnh nhúng.'],
  ['Giới hạn','1.000 dòng; file 10 MB; giải nén 50 MB; dữ liệu sau chuẩn hóa 5 MB; mỗi ô 32.767 ký tự.'],
  ['Ví dụ (không nhập)','Hỗ trợ | Khách hàng cần hướng dẫn đăng nhập | chọn tên hệ thống/phòng ban thực tế | Tiếp nhận | 17/09/2026'],
  ['Danh mục','Danh mục lấy tại thời điểm tải mẫu; hệ thống kiểm tra lại khi nhập. Không tự tạo danh mục mới.'],
 ]);guide.eachRow(r=>r.eachCell(c=>{c.alignment={wrapText:true,vertical:'top'};}));
 const choices=book.addWorksheet('Danh muc');const lists=[Object.values(requestTypes),catalogs.systems.map(x=>x.name),catalogs.categories.map(x=>x.name),catalogs.departments.map(x=>x.name),catalogs.staff.map(x=>x.name),Object.values(statuses)];
 choices.columns=['Phân loại','Hệ thống','Phân mục','Bộ phận','Nhân sự','Trạng thái','Bộ phận của nhân sự'].map(header=>({header,width:32}));
 lists.forEach((values,col)=>values.forEach((value,i)=>{choices.getCell(i+2,col+1).value=value;}));catalogs.staff.forEach((s,i)=>{choices.getCell(i+2,7).value=catalogs.departments.find(d=>d.id===s.department_id)?.name||'';});
 const validations:Record<number,number>={1:0,3:1,4:2,5:3,6:4,7:3,8:4,10:5};
 for(const [column,list] of Object.entries(validations)){if(!lists[list].length)continue;const letter=String.fromCharCode(65+list);for(let row=2;row<=1001;row++)sheet.getCell(row,Number(column)).dataValidation={type:'list',allowBlank:true,formulae:[`'Danh muc'!$${letter}$2:$${letter}$${lists[list].length+1}`],showErrorMessage:true,error:'Chọn giá trị từ danh mục.'};}
 const meta=book.addWorksheet('_meta',{state:'veryHidden'});meta.getCell('A1').value='SHS_CARE_LOGS';meta.getCell('B1').value='1';
 return book.xlsx.writeBuffer();
}
