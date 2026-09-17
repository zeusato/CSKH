import ExcelJS from 'exceljs';
const book=new ExcelJS.Workbook();let sheet:ExcelJS.Worksheet,headers:string[]=[],part=0,long:ExcelJS.Worksheet|undefined;
const safe=(v:unknown)=>typeof v==='string'&&/^[=+@\-\t\r]/.test(v)?"'"+v:v;
function newSheet(){sheet=book.addWorksheet(`Nhật ký ${++part}`,{views:[{state:'frozen',ySplit:1}]});sheet.columns=headers.map(header=>({header,width:header.includes('Mô tả')||header.includes('phản hồi')||header==='Ghi chú'?55:25}));sheet.getRow(1).height=45;sheet.getRow(1).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFB84A07'}};c.alignment={wrapText:true};});sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:headers.length}};}
function value(v:unknown,index:number,code:string){
 if([11,12,15,17].includes(index))return v?new Date(new Date(String(v)).getTime()+7*3600000):'';
 if(typeof v==='string'&&v.length>32000){if(!long){long=book.addWorksheet('Nội dung dài');long.columns=[{header:'Mã',width:20},{header:'Trường',width:35},{header:'Phần',width:10},{header:'Nội dung',width:100}];}for(let offset=0,n=1;offset<v.length;offset+=30000,n++)long.addRow([code,headers[index],n,safe(v.slice(offset,offset+30000))]);return safe(v.slice(0,31000)+'\n[Xem đầy đủ tại Nội dung dài]');}return safe(v);
}
self.onmessage=async event=>{try{const data=event.data;
 if(data.type==='start'){headers=data.headers;newSheet();const info=book.addWorksheet('Bộ lọc');info.columns=[{header:'Thông tin',width:32},{header:'Giá trị',width:80}];info.addRows([['Thời điểm xuất',new Date().toISOString()],['Múi giờ','Asia/Ho_Chi_Minh'],['Lưu ý','Dữ liệu có thể thay đổi khi xuất. Đây là báo cáo, không phải mẫu import.'],...Object.entries(data.filters).map(([k,v])=>[k,safe(v)])]);}
 if(data.type==='rows'){for(const values of data.rows){if(sheet.rowCount>=20001)newSheet();const row=sheet.addRow(values.map((v:unknown,i:number)=>value(v,i,values[0])));row.height=64;row.eachCell(c=>{c.alignment={wrapText:true,vertical:'top'};if(c.value instanceof Date)c.numFmt='dd/mm/yyyy hh:mm';});}}
 if(data.type==='errors'){const errors=book.addWorksheet('Lỗi nhập');errors.columns=[{header:'Dòng Excel',width:15},{header:'Cột',width:38},{header:'Giá trị trong file',width:60},{header:'Lý do',width:100}];for(const row of data.rows){const added=errors.addRow(row.map(safe));added.alignment={wrapText:true,vertical:'top'};}self.postMessage({buffer:await book.xlsx.writeBuffer()});}
 if(data.type==='finish')self.postMessage({buffer:await book.xlsx.writeBuffer()});
 }catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}};
