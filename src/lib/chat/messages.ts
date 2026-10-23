import { queryOptions,type QueryClient } from '@tanstack/react-query';
import { listMessages } from './api';
import type { Message,Page } from './contract';
import type { ChatSession } from './session';

export const messageKey=(id:string)=>['chat-messages',id] as const;
const unique=(items:Message[])=>{
 const byId=new Map<string,Message>();for(const message of items)if(!byId.has(message.id))byId.set(message.id,message);
 // Keep Gateway order for equal timestamps (Chatwoot timestamps have seconds).
 return [...byId.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
};

// Refresh only the newest page. Retain loaded history while the windows overlap.
// After a long disconnect with a gap, reset the cursor to the new window so that
// scrolling back cannot silently skip the messages between the two snapshots.
export function mergeLatest(current:Page<Message>|undefined,latest:Page<Message>):Page<Message>{
 const known=new Set(current?.items.map(m=>m.id));
 if(!current||!latest.items.some(m=>known.has(m.id)))return latest;
 return {items:unique([...latest.items,...current.items]),nextCursor:current.nextCursor};
}
export function messageOptions(session:ChatSession|null,id:string,cache:QueryClient,enabled=true){
 return queryOptions({queryKey:messageKey(id),enabled:enabled&&Boolean(session),queryFn:async({signal})=>{
  const latest=await listMessages(session!,id,null,signal);
  return mergeLatest(cache.getQueryData<Page<Message>>(messageKey(id)),latest);
 }});
}
export function appendOlder(cache:QueryClient,id:string,cursor:string,page:Page<Message>){
 cache.setQueryData<Page<Message>>(messageKey(id),current=>{
  // A reconnect may have reset the window while this older page was in flight.
  if(!current||current.nextCursor!==cursor)return current;
  return {items:unique([...current.items,...page.items]),nextCursor:page.nextCursor};
 });
}
export async function addSentMessage(cache:QueryClient,message:Message){
 const key=messageKey(message.conversationId);
 // An older snapshot must not replace a confirmed POST response.
 await cache.cancelQueries({queryKey:key,exact:true});
 cache.setQueryData<Page<Message>>(key,current=>current?{...current,items:unique([message,...current.items])}:undefined);
}
