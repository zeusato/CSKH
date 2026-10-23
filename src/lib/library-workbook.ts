import ExcelJS from 'exceljs';
import {formatDate} from './utils';
import {librarySourceLabels,type LibraryEntry} from './library-types';
export function libraryWorkbook(){
 const book=new ExcelJS.Workbook();book.creator='SHS CSKH';let part=0,sheet:ExcelJS.Worksheet,long:ExcelJS.Worksheet|undefined;
 const headers=['Mã bài','Tiêu đề','Mô tả vấn đề','Lời giải','Nguồn','Mã nguồn','Hệ thống','Phân mục','Lưu vào thư viện (VN)','Cập nhật (VN)','Tiếp nhận nguồn (VN)','Hoàn thành nguồn (VN)'];
 const safe=(v:string)=>/^[=+@\-\t\r]/.test(v)?"'"+v:v;
 function newSheet(){sheet=book.addWorksheet(`Thư viện ${++part}`,{views:[{state:'frozen',ySplit:1}]});sheet.columns=headers.map((header,i)=>({header,width:[2,3].includes(i)?65:i===1?45:25}));sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};sheet.getRow(1).height=35;sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB84A07'}};c.alignment={wrapText:true};});}
 newSheet();
 return {add(entries:LibraryEntry[]){for(const e of entries){if(sheet.rowCount>=20001)newSheet();const values=[e.code,e.title,e.description,e.resolution,librarySourceLabels[e.source_type],e.source_code,e.system_name||'',e.category_name||'',formatDate(e.created_at),formatDate(e.updated_at),formatDate(e.source_received_at),formatDate(e.source_completed_at)];const row=sheet.addRow(values.map((value,index)=>{
   if(value.length<=32000)return safe(value);
   if(!long){long=book.addWorksheet('Nội dung dài');long.columns=[{header:'Mã bài',width:20},{header:'Trường',width:30},{header:'Phần',width:10},{header:'Nội dung',width:100}];}
   for(let offset=0,n=1;offset<value.length;offset+=30000,n++)long.addRow([e.code,headers[index],n,safe(value.slice(offset,offset+30000))]);
   return safe(value.slice(0,31000)+'\n[Xem đầy đủ tại Nội dung dài]');
  }));row.height=72;row.alignment={vertical:'top',wrapText:true};}},finish:()=>book.xlsx.writeBuffer()};
}
