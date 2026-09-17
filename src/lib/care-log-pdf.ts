import {PDFDocument,rgb,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {CareLog} from './care-log-types';
import type {Catalogs} from './types';
import {careValues} from './care-log-files';
import {careColumns} from './care-log-import';
export async function exportCarePdf(log:CareLog,catalogs:Catalogs){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);doc.setTitle(`${log.code} · Nhật ký CSKH`);doc.setAuthor('SHS CSKH');
 const load=async(path:string)=>{const res=await fetch(import.meta.env.BASE_URL+path,{signal:AbortSignal.timeout(20000)});if(!res.ok)throw new Error(`Không tải được tài nguyên PDF: ${path}`);return new Uint8Array(await res.arrayBuffer());};
 const [normalData,boldData,logoData]=await Promise.all([load('fonts/NotoSans-Regular.ttf'),load('fonts/NotoSans-Bold.ttf'),load('LOGO Light.png')]);
 const font=await doc.embedFont(normalData,{subset:true}),bold=await doc.embedFont(boldData,{subset:true}),logo=await doc.embedPng(logoData);let page:PDFPage,y=0;
 const ink=rgb(.13,.16,.2),orange=rgb(.72,.29,.03);
 function newPage(){page=doc.addPage([595.28,841.89]);page.drawImage(logo,{x:40,y:754,width:95,height:57});page.drawText('PHIẾU THEO DÕI VẤN ĐỀ CSKH',{x:235,y:782,size:12,font:bold,color:orange});page.drawText(log.code,{x:235,y:763,size:11,font,color:ink});page.drawLine({start:{x:40,y:742},end:{x:555,y:742},thickness:1,color:orange});y=716;}
 function write(text:string,size=10,strong=false){const f=strong?bold:font;for(const paragraph of text.replace(/\r\n/g,'\n').split('\n')){let line='';const flush=()=>{if(y<65)newPage();if(line)page.drawText(line,{x:40,y,size,font:f,color:ink});y-=size+6;line='';};for(const character of paragraph){if(f.widthOfTextAtSize(line+character,size)>510)flush();line+=character;}flush();}}
 newPage();const values=careValues(log,catalogs);
 for(const [key,label] of careColumns){if(y<105)newPage();write(label,11,true);write(values[key]||'Chưa ghi nhận');y-=10;}
 write('Thông tin ghi nhận',11,true);write(`Người tạo: ${values.created_by||'—'} · ${values.created_at}`);write(`Cập nhật: ${values.updated_by||'—'} · ${values.updated_at}`);if(log.import_batch_id)write(`Đợt nhập: ${log.import_batch_id} · Dòng Excel: ${log.import_row_number}`);
 const pages=doc.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:40,y:45},end:{x:555,y:45},thickness:.5,color:rgb(.8,.8,.8)});p.drawText(`SHS · Nhật ký CSKH · Giờ Việt Nam`,{x:40,y:29,size:8,font});p.drawText(`${i+1} / ${pages.length}`,{x:510,y:29,size:8,font});});
 return new Blob([new Uint8Array(await doc.save())],{type:'application/pdf'});
}
