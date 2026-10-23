import { QueryClient } from '@tanstack/react-query';
import { describe,expect,it,vi } from 'vitest';
import type { Message,Page } from './contract';
import { addSentMessage,appendOlder,mergeLatest,messageKey,messageOptions } from './messages';
import type { ChatSession } from './session';

const message=(n:number,more:Partial<Message>={}):Message=>({id:`m${n}`,conversationId:'c1',clientMessageId:`client${n}`,sender:{id:'me',kind:'agent',displayName:'Test'},visibility:'public',text:`Synthetic ${n}`,createdAt:new Date(n*1000).toISOString(),status:'accepted',attachments:[],...more});
const page=(ids:number[],nextCursor:string|null=null):Page<Message>=>({items:ids.map(n=>message(n)),nextCursor});
describe('message timeline',()=>{
 it('refreshes only the head, retaining loaded history and its cursor',async()=>{
  const cache=new QueryClient();cache.setQueryData(messageKey('c1'),page([5,4,3,2],'older'));
  const call=vi.fn(async()=>page([6,5,4],'head-cursor'));
  await cache.fetchQuery(messageOptions({call} as unknown as ChatSession,'c1',cache));
  expect(call).toHaveBeenCalledOnce();expect(call.mock.calls[0]).toEqual(['GET','/conversations/c1/messages?limit=19',undefined,{signal:expect.any(AbortSignal)}]);
  expect(cache.getQueryData(messageKey('c1'))).toEqual(page([6,5,4,3,2],'older'));cache.clear();
 });
 it('resets a disconnected window rather than silently skipping a gap',()=>{
  expect(mergeLatest(page([3,2,1],'old'),page([30,29,28],'gap'))).toEqual(page([30,29,28],'gap'));
 });
 it('uses server order and deduplicates equal-timestamp messages',()=>{
  const a=message(1),b=message(2,{createdAt:a.createdAt}),c=message(3,{createdAt:a.createdAt});
  expect(mergeLatest({items:[b,a],nextCursor:null},{items:[c,b],nextCursor:'a'}).items.map(m=>m.id)).toEqual(['m3','m2','m1']);
 });
 it('an old-page response keeps concurrent new messages and cannot apply to a reset cursor',()=>{
  const cache=new QueryClient();cache.setQueryData(messageKey('c1'),page([5,4,3],'older'));
  appendOlder(cache,'c1','older',page([3,2,1]));expect(cache.getQueryData(messageKey('c1'))).toEqual(page([5,4,3,2,1]));
  cache.setQueryData(messageKey('c1'),page([20,19],'reset'));
  appendOlder(cache,'c1','older',page([2,1]));expect(cache.getQueryData(messageKey('c1'))).toEqual(page([20,19],'reset'));cache.clear();
 });
 it('shows a confirmed send immediately and cancels a stale in-flight snapshot',async()=>{
  const cache=new QueryClient();cache.setQueryData(messageKey('c1'),page([1]));
  let finish!:(value:Page<Message>)=>void;let signal:AbortSignal|undefined;
  const call=vi.fn(async(_method:string,_path:string,_body:unknown,options:{signal:AbortSignal})=>{signal=options.signal;return new Promise<Page<Message>>(r=>{finish=r;});});
  const loading=cache.fetchQuery(messageOptions({call} as unknown as ChatSession,'c1',cache)).catch(()=>{});
  await addSentMessage(cache,message(2,{createdAt:message(1).createdAt}));expect(signal?.aborted).toBe(true);
  finish(page([1]));await loading;
  expect(cache.getQueryData<Page<Message>>(messageKey('c1'))?.items.map(m=>m.id)).toEqual(['m2','m1']);
  await addSentMessage(cache,message(2,{createdAt:message(1).createdAt}));expect(cache.getQueryData<Page<Message>>(messageKey('c1'))?.items).toHaveLength(2);cache.clear();
 });
 it('does not recreate cleared history after logout',async()=>{
  const cache=new QueryClient();await addSentMessage(cache,message(1));expect(cache.getQueryData(messageKey('c1'))).toBeUndefined();cache.clear();
 });
});
