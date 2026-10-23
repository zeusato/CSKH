// `message` của Gateway dành cho dev; UI ánh xạ `code` sang tiếng Việt (integration-guide §10).
import { ChatError } from './session';
export type ChatErrorAction='refetch'|'remove'|'input'|'retry'|'none';
const map:Record<string,[string,ChatErrorAction]>={
 ALREADY_CLAIMED:['Đồng nghiệp vừa nhận khách này. Bạn có thể Tham gia hỗ trợ.','refetch'],
 REVISION_CONFLICT:['Hội thoại vừa thay đổi, đã tải lại.','refetch'],
 INVALID_TRANSITION:['Trạng thái hội thoại đã đổi, đã tải lại.','refetch'],
 CONVERSATION_RESOLVED:['Hội thoại đã kết thúc.','refetch'],
 FORBIDDEN:['Bạn không còn quyền thao tác này.','refetch'],
 NOT_FOUND:['Hội thoại không còn trong phạm vi của bạn.','remove'],
 VALIDATION_FAILED:['Nội dung chưa hợp lệ. Kiểm tra lại độ dài và thử lại.','input'],
 PAYLOAD_TOO_LARGE:['Nội dung quá dài.','input'],
 ENGINE_NOT_READY:['Máy chủ chat đang bận, đang thử lại.','retry'],
 DEPENDENCY_FAILED:['Máy chủ chat đang bận, đang thử lại.','retry'],
 UNAUTHENTICATED:['Phiên chat đã hết, đang kết nối lại…','retry'],
};
export function chatError(e:unknown):{message:string;action:ChatErrorAction;code:string;correlationId:string}{
 if(e instanceof ChatError){
  if(e.code==='IDEMPOTENCY_KEY_REUSED')console.error('[chat] IDEMPOTENCY_KEY_REUSED: lỗi client',e.correlationId);
  const [message,action]=map[e.code]??['Không thực hiện được, thử lại sau.','none'];return {message,action,code:e.code,correlationId:e.correlationId};
 }
 return {message:e instanceof TypeError?'Không kết nối được máy chủ chat. Kiểm tra mạng rồi thử lại.':'Không thực hiện được, thử lại sau.',action:'none',code:'CLIENT',correlationId:''};
}
