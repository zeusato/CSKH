// DTO của Chat Gateway, chép từ docs/chat-gateway/openapi.yaml (Chat-server commit ce1d50b). Không import đường dẫn máy.
// Gateway có thể thêm field mới: client bỏ qua field lạ. Enum lạ thì xử lý theo hướng chặn (safeConversation).
export type ConversationStatus='open'|'pending_customer'|'resolved';
export type SyncState='ready'|'pending'|'failed';
export type StaffRole='agent'|'supervisor'|'observer'|'advisor'|'advisory_supervisor';
export type Capabilities={canReply:boolean;canClaim:boolean;canTransfer:boolean;canAddNote:boolean;canResolve:boolean;canRelease:boolean;canManageParticipants:boolean;canJoin:boolean;canLeave:boolean;canReopen:boolean};
export type PersonRef={id:string;displayName:string};
export type Participant=PersonRef&{role:'collaborator'|'delegate';expiresAt:string|null};
export type Conversation={id:string;kind:'support'|'advisory';accountRef:string;subject:string;status:ConversationStatus;owner:PersonRef|null;revision:number;unreadCount:number;updatedAt:string;syncState:SyncState;needsReview:boolean;capabilities:Capabilities;customer?:PersonRef;participants?:Participant[];
 /** Client: true khi Gateway trả enum chưa biết; mọi thao tác bị khóa. */ unknownState?:boolean};
export type Message={id:string;conversationId:string;clientMessageId:string|null;sender:{id:string;kind:'customer'|'agent'|'system';displayName:string};visibility:'public'|'internal';text:string;createdAt:string;status:'accepted'|'delivered'|'read';attachments:unknown[]};
export type MessageReceipt={clientMessageId:string;conversationId:string;status:'processing'|'accepted'|'unknown'|'rejected';messageId:string|null};
export type Page<T>={items:T[];nextCursor:string|null};
export type QueueMember={id:string;displayName:string;roles:StaffRole[]};
export type ChatEvent={eventId:string;type:string;conversationId:string;occurredAt:string;revision:number|null;cursor:string;payload:Record<string,unknown>};
export type SessionGrant={accessToken:string;expiresAt:string;principal:{id:string;kind:'customer'|'staff';displayName:string};capabilities:{roles:StaffRole[];queueIds:string[];accountRefs:string[]}};
export type ErrorBody={code:string;message:string;correlationId:string;retryable:boolean};
export const QUEUE_ID='support-default';
export const LIMITS={textMaxChars:8000,pageSize:50,reasonMaxChars:500};
export const capabilityKeys=['canReply','canClaim','canTransfer','canAddNote','canResolve','canRelease','canManageParticipants','canJoin','canLeave','canReopen'] as const;
export const noCapabilities=Object.fromEntries(capabilityKeys.map(k=>[k,false])) as Capabilities;
const statuses=['open','pending_customer','resolved'],syncStates=['ready','pending','failed'];
export function safeConversation(c:Conversation):Conversation{
 const capabilities=Object.fromEntries(capabilityKeys.map(k=>[k,c.capabilities?.[k]===true])) as Capabilities;
 const unknownState=!statuses.includes(c.status)||!syncStates.includes(c.syncState);
 if(unknownState)console.warn('[chat] Gateway trả trạng thái chưa hỗ trợ, khóa thao tác',{conversationId:c.id,status:c.status,syncState:c.syncState});
 // Người hỗ trợ không gồm owner (sau khi chuyển cho chính người hỗ trợ, Gateway có thể còn giữ bản ghi cũ).
 return {...c,participants:Array.isArray(c.participants)?c.participants.filter(p=>p.id!==c.owner?.id):[],capabilities:unknownState?noCapabilities:capabilities,unknownState};
}
// Đếm ký tự theo code point như Gateway.
export const codePoints=(text:string)=>[...text].length;
