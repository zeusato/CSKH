// Draft chỉ giữ trong RAM, theo principal + hội thoại: không lưu xuống storage vì có thể chứa thông tin khách.
export type Draft={text:string;mode:'public'|'internal'};
const drafts=new Map<string,Draft>();
const key=(principalId:string,conversationId:string)=>`${principalId}:${conversationId}`;
export function getDraft(principalId:string,conversationId:string):Draft{return drafts.get(key(principalId,conversationId))??{text:'',mode:'public'};}
export function setDraft(principalId:string,conversationId:string,draft:Draft){if(!draft.text&&draft.mode==='public')drafts.delete(key(principalId,conversationId));else drafts.set(key(principalId,conversationId),draft);}
export function clearDrafts(){drafts.clear();}
