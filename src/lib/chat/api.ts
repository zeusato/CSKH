// Gọi Chat Gateway qua ChatSession. Thao tác đổi trạng thái luôn gửi expectedRevision; 409 thì refetch, không tự thử lại.
import { LIMITS,QUEUE_ID,safeConversation,type Conversation,type Message,type MessageReceipt,type Page,type QueueMember } from './contract';
import { ChatError,type ChatSession } from './session';
export type QueueTab='unclaimed'|'mine'|'others'|'pending'|'resolved';
export const queueTabs:Record<QueueTab,{label:string;query:Record<string,string>}>={
 unclaimed:{label:'Chưa nhận',query:{status:'open',owner:'none'}},
 mine:{label:'Của tôi',query:{mine:'true'}},
 others:{label:'Đang có người chăm sóc',query:{status:'open',owner:'others'}},
 pending:{label:'Chờ khách',query:{status:'pending_customer'}},
 resolved:{label:'Đã xong',query:{status:'resolved'}},
};
const qs=(o:Record<string,string|undefined|null>)=>{const p=new URLSearchParams();for(const [k,v] of Object.entries(o))if(v)p.set(k,v);const s=p.toString();return s?`?${s}`:'';};
const id=(v:string)=>encodeURIComponent(v);
export async function listQueue(s:ChatSession,tab:QueueTab,accountRef:string,cursor:string|null):Promise<Page<Conversation>>{
 // Cursor gắn với bộ lọc: đổi tab hoặc ô tìm STK thì query key đổi, cursor cũ bị bỏ.
 const page=await s.call<Page<Conversation>>('GET',`/queues/${QUEUE_ID}/conversations${qs({...queueTabs[tab].query,accountRef:accountRef||null,cursor,limit:String(LIMITS.pageSize)})}`);
 return {items:page.items.map(safeConversation),nextCursor:page.nextCursor};
}
export const getConversation=async(s:ChatSession,cid:string)=>safeConversation(await s.call<Conversation>('GET',`/conversations/${id(cid)}`));
export const listMessages=(s:ChatSession,cid:string,cursor:string|null)=>s.call<Page<Message>>('GET',`/conversations/${id(cid)}/messages${qs({cursor,limit:String(LIMITS.pageSize)})}`);
export const listMembers=(s:ChatSession)=>s.call<{items:QueueMember[]}>('GET',`/queues/${QUEUE_ID}/members`).then(r=>r.items);
export const markRead=(s:ChatSession,cid:string,lastReadMessageId:string)=>s.call<{lastReadMessageId:string}>('POST',`/conversations/${id(cid)}/read`,{lastReadMessageId});
export type Action={kind:'claim'|'join'|'leave'}|{kind:'release';reason?:string}|{kind:'transfer';targetPrincipalId:string;reason?:string}|{kind:'status';status:'open'|'pending_customer'|'resolved'}|{kind:'addParticipant';principalId:string}|{kind:'removeParticipant';principalId:string};
export async function act(s:ChatSession,c:Conversation,a:Action):Promise<Conversation>{
 const base=`/conversations/${id(c.id)}`,expectedRevision=c.revision;let r:Conversation;
 switch(a.kind){
  case 'claim':case 'join':case 'leave':r=await s.call('POST',`${base}/${a.kind}`,{expectedRevision});break;
  case 'release':r=await s.call('POST',`${base}/release`,{expectedRevision,...(a.reason?{reason:a.reason}:{})});break;
  case 'transfer':r=await s.call('POST',`${base}/transfer`,{targetPrincipalId:a.targetPrincipalId,expectedRevision,...(a.reason?{reason:a.reason}:{})});break;
  case 'status':r=await s.call('PATCH',`${base}/status`,{status:a.status,expectedRevision});break;
  case 'addParticipant':r=await s.call('POST',`${base}/participants`,{principalId:a.principalId,role:'collaborator',expectedRevision});break;
  case 'removeParticipant':r=await s.call('DELETE',`${base}/participants/${id(a.principalId)}${qs({expectedRevision:String(expectedRevision)})}`);break;
 }
 return safeConversation(r);
}
// Gửi tin (integration-guide §8). clientMessageId sinh một lần cho mỗi tin; retry do mạng dùng lại đúng id và nội dung.
export type SendOutcome={kind:'sent';message:Message}|{kind:'accepted';messageId:string|null}|{kind:'unknown'}|{kind:'rejected'};
type SendDeps={sleep?:(ms:number)=>Promise<void>;maxPolls?:number};
export async function sendMessage(s:ChatSession,cid:string,input:{clientMessageId:string;text:string;visibility:'public'|'internal'},d:SendDeps={}):Promise<SendOutcome>{
 const sleep=d.sleep??(ms=>new Promise<void>(r=>setTimeout(r,ms)));
 let res:Message|MessageReceipt;
 for(let attempt=0;;attempt++){
  try{res=await s.call<Message|MessageReceipt>('POST',`/conversations/${id(cid)}/messages`,input);break;}
  catch(e){
   // Mạng rớt giữa chừng: gửi lại cùng clientMessageId là an toàn (Gateway trả lại đúng tin cũ).
   const transient=e instanceof TypeError||(e instanceof ChatError&&e.code==='DEPENDENCY_FAILED'&&e.retryable);
   if(!transient||attempt>=2)throw e;await sleep(1000*2**attempt);
  }
 }
 if('sender' in res)return {kind:'sent',message:res};
 let receipt=res;
 for(let poll=0;receipt.status==='processing'&&poll<(d.maxPolls??6);poll++){await sleep(Math.min(8000,1000*2**poll));receipt=await s.call<MessageReceipt>('GET',`/message-requests/${id(input.clientMessageId)}${qs({conversationId:cid})}`);}
 if(receipt.status==='accepted')return {kind:'accepted',messageId:receipt.messageId};
 if(receipt.status==='rejected')return {kind:'rejected'};
 // processing quá lâu hoặc unknown: không tự gửi lại, để nhân viên đối chiếu lịch sử.
 return {kind:'unknown'};
}
