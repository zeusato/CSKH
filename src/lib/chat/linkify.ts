// Tin nhắn là plain text (D27): tách đoạn chữ và link http/https. Không bao giờ render HTML.
export type TextPart={text:string;href?:string};
const URL_RE=/\bhttps?:\/\/[^\s<>"]+/gi;
// Dấu câu (kể cả dấu câu tiếng Việt thường gặp) dính cuối URL không thuộc link.
const TRAILING=/[.,;:!?)\]}'"»”’…]+$/;
export function linkify(text:string):TextPart[]{
 const parts:TextPart[]=[];let last=0;
 for(const m of text.matchAll(URL_RE)){
  const start=m.index!;let raw=m[0];raw=raw.slice(0,raw.length-(raw.match(TRAILING)?.[0].length??0));if(!raw)continue;
  let href:string|undefined;try{const u=new URL(raw);if(u.protocol==='http:'||u.protocol==='https:')href=u.href;}catch{/* Giữ nguyên là chữ */}
  if(start>last)parts.push({text:text.slice(last,start)});parts.push(href?{text:raw,href}:{text:raw});last=start+raw.length;
 }
 if(last<text.length)parts.push({text:text.slice(last)});
 return parts.reduce<TextPart[]>((all,p)=>{const prev=all[all.length-1];if(prev&&!prev.href&&!p.href)prev.text+=p.text;else all.push({...p});return all;},[]);
}
