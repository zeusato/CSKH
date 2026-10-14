import type {CatalogItem,Catalogs} from './types';
import {statuses} from './types';
import {requestTypes,type ImportRow,type ImportIssue} from './care-log-types';
import {formatDate} from './utils';
export const careColumns = [
 ['request_type','Phân loại yêu cầu'],['description','Mô tả vấn đề'],['system_id','Kênh phát sinh lỗi'],['category_id','Phân mục'],
 ['receiving_department_id','Bộ phận tiếp nhận'],['receiving_staff_id','Nhân sự tiếp nhận'],['coordinating_department_id','Bộ phận phối hợp xử lý'],['coordinating_staff_id','Nhân sự phối hợp xử lý'],
 ['response_content','Nội dung phản hồi từ bộ phận CSKH'],['status','Trạng thái xử lý'],['received_at','Thời gian tiếp nhận'],['completed_at','Thời gian hoàn thành'],['notes','Ghi chú'],['account_user','Số tài khoản/user'],
] as const;
export const normalizeName=(value:string)=>value.normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('vi');
export type RawCareRow={row:number;values:Record<string,string>};
export type ParsedCareFile={raw:RawCareRow[];errors:ImportIssue[];warnings:ImportIssue[];blankRows:number;hiddenRows:number;otherSheets:string[]};
export function parseCareDate(value:string):{value:string|null;dateOnly:boolean} {
 if(!value.trim())return {value:null,dateOnly:false};
 const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{2}):(\d{2}))?$/.exec(value.trim());
 if(!match)throw new Error('Nhập ngày theo dd/mm/yyyy, ví dụ 17/09/2026, hoặc dùng ô ngày Excel.');
 const [,rawDay,rawMonth,year,hour='00',minute='00']=match;
 const day=rawDay.padStart(2,'0'),month=rawMonth.padStart(2,'0');
 const iso=`${year}-${month}-${day}T${hour}:${minute}:00+07:00`;const date=new Date(iso);
 if(Number(year)<1900||Number(hour)>23||Number(minute)>59||!Number.isFinite(date.getTime()))throw new Error('Ngày giờ không hợp lệ.');
 const local=new Date(date.getTime()+7*3600000).toISOString().slice(0,16);
 if(local!==`${year}-${month}-${day}T${hour}:${minute}`)throw new Error('Ngày giờ không tồn tại.');
 return {value:date.toISOString(),dateOnly:!match[4]};
}
export function careImportDateLabel(value:string){
 try{const date=parseCareDate(value).value;return date?formatDate(date,false):'';}catch{return value;}
}
export function normalizeCareRows(parsed:ParsedCareFile,catalogs:Catalogs){
 const errors=[...parsed.errors],warnings=[...parsed.warnings],rows:ImportRow[]=[];
 for(const raw of parsed.raw){
  const data:Record<string,unknown>={row:raw.row};const before=errors.length;
  const fail=(field:string,message:string)=>errors.push({row:raw.row,field,message});
  const catalog=(key:string,items:CatalogItem[],required=false,department?:string)=>{
   const value=raw.values[key]||'';if(!value){if(required)fail(key,'Thông tin bắt buộc.');return null;}
   const named=items.filter(x=>normalizeName(x.name)===normalizeName(value));
   const matches=named.filter(x=>department===undefined||x.department_id===department);
   if(matches.length!==1){
    if(matches.length)fail(key,`Tên “${value}” bị trùng trong danh mục${department!==undefined?' của bộ phận đã chọn':''}. Cần phân biệt tên trước khi nhập.`);
    else if(!named.length)fail(key,`Không tìm thấy “${value}” trong danh mục hiện tại. Kiểm tra tên trong sheet Danh muc hoặc tải lại mẫu mới.`);
    else if(!department)fail(key,'Chọn bộ phận hợp lệ trước khi chọn nhân sự.');
    else {
     const selected=catalogs.departments.find(x=>x.id===department)?.name||'bộ phận đã chọn';
     const actual=[...new Set(named.map(x=>catalogs.departments.find(d=>d.id===x.department_id)?.name||'Chưa có bộ phận'))].join(', ');
     fail(key,`“${value}” thuộc ${actual}, không thuộc ${selected}. Chọn lại bộ phận hoặc nhân sự tương ứng.`);
    }
    return null;
   }return matches[0].id;
  };
  for(const key of ['description','response_content','notes']){const value=(raw.values[key]||'').trim();data[key]=value;if(value.length>32767)fail(key,'Mỗi ô tối đa 32.767 ký tự.');}
  data.account_user=(raw.values.account_user||'').trim();
  if(String(data.account_user).length>255)fail('account_user','Số tài khoản/user tối đa 255 ký tự.');
  if(!data.description)fail('description','Mô tả vấn đề bắt buộc.');
  for(const [key,options] of [['request_type',requestTypes],['status',statuses]] as const){const found=Object.entries(options).find(([,label])=>normalizeName(label)===normalizeName(raw.values[key]||''));if(!found)fail(key,'Giá trị không hợp lệ hoặc chưa được nhập.');else data[key]=found[0];}
  data.system_id=catalog('system_id',catalogs.systems);data.category_id=catalog('category_id',catalogs.categories);
  data.receiving_department_id=catalog('receiving_department_id',catalogs.departments,true);
  data.coordinating_department_id=catalog('coordinating_department_id',catalogs.departments);
  data.receiving_staff_id=catalog('receiving_staff_id',catalogs.staff,false,String(data.receiving_department_id||''));
  data.coordinating_staff_id=catalog('coordinating_staff_id',catalogs.staff,false,String(data.coordinating_department_id||''));
  for(const key of ['received_at','completed_at']){try{data[key]=parseCareDate(raw.values[key]||'').value;}catch(e){fail(key,(e as Error).message);}}
  if(!raw.values.received_at?.trim())fail('received_at','Thời gian tiếp nhận bắt buộc. Nhập theo dd/mm/yyyy.');
  if(data.status==='resolved'&&!raw.values.completed_at?.trim())fail('completed_at','Đã xử lý cần ngày hoàn thành theo dd/mm/yyyy.');
  if(data.status&&data.status!=='resolved'&&data.completed_at)fail('completed_at',`Đang chọn trạng thái “${raw.values.status}”. Xóa ngày hoàn thành, hoặc chọn “Đã xử lý” nếu công việc đã hoàn tất.`);
  if(data.completed_at&&data.received_at&&String(data.completed_at)<String(data.received_at))fail('completed_at','Hoàn thành không được trước tiếp nhận.');
  if(errors.length===before)rows.push(data as ImportRow);
 }
 if(new TextEncoder().encode(JSON.stringify(rows)).length>5*1024*1024)errors.push({row:0,field:'File',message:'Dữ liệu sau xử lý vượt 5 MB. Hãy chia file.'});
 return {rows,errors,warnings};
}
