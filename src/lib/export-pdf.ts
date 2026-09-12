import { PDFDocument,rgb,type PDFFont,type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Attachment,Catalogs,Ticket } from './types';
import { originFacts } from './ticket-origin';
import { statuses } from './types';
import { formatDate,processingTime } from './utils';
const colors={ink:rgb(.125,.153,.2),muted:rgb(.32,.38,.45),orange:rgb(.72,.29,.027),line:rgb(.86,.88,.91),surface:rgb(.965,.969,.976),green:rgb(.14,.45,.29),greenBg:rgb(.93,.97,.94)};
async function bytes(url:string,label='ảnh đính kèm'){try{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`HTTP ${response.status}`);return new Uint8Array(await response.arrayBuffer());}catch{throw new Error(`Không tải được ${label} để tạo PDF. Kiểm tra kết nối tới ứng dụng rồi thử lại.`);}}
function wrap(text:string,font:PDFFont,size:number,width:number){
 const lines:string[]=[];
 for(const paragraph of text.replace(/\r\n/g,'\n').split('\n')){
  if(!paragraph.trim()){lines.push('');continue;}let line='';
  for(const word of paragraph.split(/\s+/)){
   const candidate=line?`${line} ${word}`:word;
   if(font.widthOfTextAtSize(candidate,size)<=width){line=candidate;continue;}
   if(line){lines.push(line);line='';}
   if(font.widthOfTextAtSize(word,size)<=width){line=word;continue;}
   for(const character of word){if(font.widthOfTextAtSize(line+character,size)>width){lines.push(line);line='';}line+=character;}
  }
  if(line)lines.push(line);
 }return lines;
}
export async function exportTicketPdf(ticket:Ticket,catalogs:Catalogs|undefined,attachments:Attachment[]){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);doc.setTitle(`${ticket.code} · ${ticket.title}`);doc.setAuthor('SHS CSKH');doc.setCreator('SHS Customer Care Workspace');
 const [regularBytes,boldBytes,logoBytes]=await Promise.all([bytes(`${import.meta.env.BASE_URL}fonts/NotoSans-Regular.ttf`,'phông chữ thường'),bytes(`${import.meta.env.BASE_URL}fonts/NotoSans-Bold.ttf`,'phông chữ đậm'),bytes(`${import.meta.env.BASE_URL}LOGO Light.png`,'logo SHS')]);
 const regular=await doc.embedFont(regularBytes,{subset:true}),bold=await doc.embedFont(boldBytes,{subset:true}),logo=await doc.embedPng(logoBytes);
 const width=595.28,height=841.89,margin=40,contentWidth=width-margin*2;let page!:PDFPage;let y=0;
 function newPage(){page=doc.addPage([width,height]);page.drawImage(logo,{x:margin,y:height-93,width:95,height:57});page.drawText('CHỨNG KHOÁN SÀI GÒN HÀ NỘI',{x:width-margin-regular.widthOfTextAtSize('CHỨNG KHOÁN SÀI GÒN HÀ NỘI',8),y:height-56,font:regular,size:8,color:colors.muted});page.drawText('KHÔNG GIAN LÀM VIỆC CSKH',{x:width-margin-regular.widthOfTextAtSize('KHÔNG GIAN LÀM VIỆC CSKH',8),y:height-71,font:regular,size:8,color:colors.muted});page.drawLine({start:{x:margin,y:height-105},end:{x:width-margin,y:height-105},thickness:1.5,color:colors.orange});y=height-130;}
 function ensure(space:number){if(y-space<58)newPage();}
 function line(value:string,size=10,font=regular,color=colors.ink,x=margin){page.drawText(value,{x,y,font,size,color});}
 function section(title:string,text:string,green=false){
  ensure(65);y-=16;line(title,12,bold,green?colors.green:colors.ink);y-=24;const inset=green?12:0;
  for(const value of wrap(text||'Chưa ghi nhận nội dung.',regular,10,contentWidth-inset*2)){
   if(y-18<58){newPage();line(`${title} (tiếp)`,11,bold,green?colors.green:colors.ink);y-=24;}
   if(green)page.drawRectangle({x:margin,y:y-5,width:contentWidth,height:18,color:colors.greenBg});
   if(value)line(value,10,regular,colors.ink,margin+inset);y-=18;
  }y-=10;
 }
 newPage();line(`PHIẾU GHI NHẬN & XỬ LÝ · ${ticket.code}`,9,regular,colors.orange);y-=31;
 for(const value of wrap(ticket.title,bold,20,contentWidth)){ensure(28);line(value,20,bold);y-=28;}y-=9;
 const rows=[...originFacts(ticket),['Trạng thái',statuses[ticket.status]],['Tiếp nhận',formatDate(ticket.received_at)],['Hoàn thành',formatDate(ticket.completed_at)],['Thời gian xử lý',processingTime(ticket.received_at,ticket.completed_at)],['Hệ thống',catalogs?.systems.find(x=>x.id===ticket.system_id)?.name||'Chưa xác định'],['Phân mục',catalogs?.categories.find(x=>x.id===ticket.category_id)?.name||'Chưa phân mục'],['Bộ phận xử lý',catalogs?.departments.find(x=>x.id===ticket.department_id)?.name||'Chưa xác định'],['Nhân sự xử lý',catalogs?.staff.find(x=>x.id===ticket.staff_id)?.name||'Chưa xác định'],['Người tạo',catalogs?.app_users.find(x=>x.id===ticket.created_by)?.name||'—'],['Ngày tạo ticket',formatDate(ticket.created_at)]];
 for(const [label,value] of rows){const lines=wrap(value,regular,9,contentWidth-150);const rowHeight=Math.max(23,lines.length*15+8);ensure(rowHeight);page.drawRectangle({x:margin,y:y-rowHeight+7,width:contentWidth,height:rowHeight,color:colors.surface});line(label,9,regular,colors.muted,margin+12);for(let i=0;i<lines.length;i++)page.drawText(lines[i],{x:margin+146,y:y-i*15,font:regular,size:9,color:colors.ink});y-=rowHeight;}y-=4;
 section('Mô tả vấn đề',ticket.description);section('Kết quả xử lý',ticket.resolution,true);
 if(attachments.length){newPage();line('Ảnh đính kèm',16,bold);y-=30;}
 for(let i=0;i<attachments.length;i++){
  const attachment=attachments[i];let embedded;
  try{if(!attachment.url)throw new Error();const data=await bytes(attachment.url);
   if(attachment.mime_type==='image/png')embedded=await doc.embedPng(data);
   else if(attachment.mime_type==='image/jpeg')embedded=await doc.embedJpg(data);
   else{const blob=new Blob([new Uint8Array(data)],{type:attachment.mime_type});const bitmap=await createImageBitmap(blob);const canvas=document.createElement('canvas');const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();embedded=await doc.embedPng(canvas.toDataURL('image/png'));}
  }catch{/* The PDF explicitly records a missing image below. */}
  const caption=wrap(`Ảnh ${i+1} · ${attachment.name}`,regular,9,contentWidth);
  const scale=embedded?Math.min(contentWidth/embedded.width,480/embedded.height,1):1;const imageHeight=embedded?embedded.height*scale:25;
  ensure(imageHeight+caption.length*15+35);for(const value of caption){line(value,9,regular,colors.muted);y-=15;}y-=5;
  if(embedded){page.drawImage(embedded,{x:margin,y:y-imageHeight,width:embedded.width*scale,height:imageHeight});y-=imageHeight+24;}else{line('Không tải được ảnh tại thời điểm xuất PDF.',9,regular,colors.muted);y-=35;}
 }
 const allPages=doc.getPages();for(let i=0;i<allPages.length;i++){const footer=`${ticket.code} · Xuất ${formatDate(new Date().toISOString())} (VN)`;const number=`${i+1} / ${allPages.length}`;allPages[i].drawLine({start:{x:margin,y:42},end:{x:width-margin,y:42},thickness:.5,color:colors.line});allPages[i].drawText(footer,{x:margin,y:27,font:regular,size:8,color:colors.muted});allPages[i].drawText(number,{x:width-margin-regular.widthOfTextAtSize(number,8),y:27,font:regular,size:8,color:colors.muted});}
 const output=await doc.save();return new Blob([new Uint8Array(output)],{type:'application/pdf'});
}
