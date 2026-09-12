import ExcelJS from 'exceljs';
const workbook=new ExcelJS.Workbook();workbook.creator='SHS CSKH';
const headers=['Mã ticket','Tiêu đề','Mô tả vấn đề','Kết quả xử lý','Trạng thái','Tiếp nhận (VN)','Tạo ticket (VN)','Hoàn thành (VN)','Hệ thống','Phân mục','Bộ phận xử lý','Nhân sự xử lý','Người tạo','Cập nhật (VN)','Số ảnh','Nguồn phát sinh','Tên MG','User MG','Phòng MG','Tên KH','Số TK','MG QL'];
let sheet:ExcelJS.Worksheet;let part=0;
let longText:ExcelJS.Worksheet|undefined;
const safe=(v:unknown)=>typeof v==='string'&&/^[=+@\-\t\r]/.test(v)?"'"+v:v;
function cellValue(value:unknown,column:number,code:string){
 if([5,6,7,13].includes(column))return value?new Date(new Date(String(value)).getTime()+7*3600_000):'';
 if(typeof value==='string'&&value.length>32000){
  if(!longText){longText=workbook.addWorksheet('Nội dung dài');longText.columns=[{header:'Mã ticket',width:20},{header:'Trường',width:24},{header:'Phần',width:10},{header:'Nội dung đầy đủ',width:100}];}
  for(let offset=0,n=1;offset<value.length;offset+=30000,n++){const row=longText.addRow([code,headers[column],n,safe(value.slice(offset,offset+30000))]);row.alignment={wrapText:true,vertical:'top'};}
  return safe(value.slice(0,31000)+'\n[Đọc toàn bộ nội dung tại trang tính “Nội dung dài”, mã '+code+']');
 }
 return safe(value);
}
function createSheet(){part++;sheet=workbook.addWorksheet(`Ticket ${part}`,{views:[{state:'frozen',ySplit:1}]});sheet.columns=headers.map((header,i)=>({header,width:i===1?45:i===2||i===3?65:i===14?10:24}));sheet.getRow(1).height=30;sheet.getRow(1).eachCell(cell=>{cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB84A07'}};cell.font={color:{argb:'FFFFFFFF'},bold:true,size:11};});sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};}
self.onmessage=async(e:MessageEvent)=>{try{
 if(e.data.type==='start'){createSheet();const info=workbook.addWorksheet('Bộ lọc');info.columns=[{header:'Thông tin',width:28},{header:'Giá trị',width:80}];info.addRow(['Thời điểm xuất',new Date().toISOString()]);info.addRow(['Múi giờ','Asia/Ho_Chi_Minh (UTC+7)']);info.addRow(['Lưu ý','Dữ liệu có thể thay đổi trong khi xuất. Mỗi trang tính tối đa 20.000 ticket.']);for(const [k,v]of Object.entries(e.data.filters))info.addRow([k,String(v||'Tất cả')]);}
 if(e.data.type==='rows'){for(const values of e.data.rows){if(sheet.rowCount>=20001)createSheet();const row=sheet.addRow(values.map((v:unknown,i:number)=>cellValue(v,i,String(values[0]))));row.eachCell(cell=>{cell.alignment={vertical:'top',wrapText:true};cell.font={name:'Arial',size:11};if(cell.value instanceof Date)cell.numFmt='dd/mm/yyyy hh:mm';if(row.number%2===0)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF6F7F9'}};});row.height=72;}}
 if(e.data.type==='finish'){const buffer=await workbook.xlsx.writeBuffer();self.postMessage({buffer});}
 }catch(error){self.postMessage({error:error instanceof Error?error.message:String(error)});}};
