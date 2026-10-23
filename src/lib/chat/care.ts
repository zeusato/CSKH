// Ai đang chăm sóc khách: badge trên pool và banner trong hội thoại (CHAT-PLAN §5.4).
import type { Conversation } from './contract';
export type CareTone='waiting'|'mine'|'other'|'closed';
export type CareBadge={tone:CareTone;label:string;helpers:number;helping:boolean};
export function careBadge(c:Conversation,principalId:string):CareBadge{
 const participants=c.participants||[];const helping=participants.some(p=>p.id===principalId);const helpers=participants.length;
 if(c.status==='resolved')return {tone:'closed',label:'Đã kết thúc',helpers,helping};
 if(!c.owner)return {tone:'waiting',label:'Chưa có người nhận',helpers,helping};
 if(c.owner.id===principalId)return {tone:'mine',label:'Bạn đang chăm sóc',helpers,helping};
 return {tone:helping?'mine':'other',label:helping?`Bạn đang hỗ trợ ${c.owner.displayName}`:`Đang được ${c.owner.displayName} chăm sóc`,helpers,helping};
}
export type BannerKind='readonly'|'closed'|'waiting'|'owner'|'helper'|'other';
export function careBanner(c:Conversation,principalId:string,readOnly:boolean):{kind:BannerKind;text:string}{
 if(readOnly)return {kind:'readonly',text:'Bạn đang xem ở chế độ chỉ đọc'};
 if(c.status==='resolved')return {kind:'closed',text:'Hội thoại đã kết thúc'};
 if(!c.owner)return {kind:'waiting',text:'Khách đang chờ phản hồi'};
 if(c.owner.id===principalId)return {kind:'owner',text:c.status==='pending_customer'?'Bạn đang chăm sóc · Đang chờ khách phản hồi':'Bạn đang chăm sóc'};
 if((c.participants||[]).some(p=>p.id===principalId))return {kind:'helper',text:`Bạn đang hỗ trợ ${c.owner.displayName}`};
 return {kind:'other',text:`${c.owner.displayName} đang chăm sóc khách này`};
}
export const unreadLabel=(n:number)=>n>99?'99+':String(n);
