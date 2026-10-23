import { QueryClient,QueryObserver } from '@tanstack/react-query';
import { describe,expect,it,vi } from 'vitest';
import { refreshChatQueries } from './cache';

const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
describe('event-driven cache refresh',()=>{
 it('reconciles an event during the initial snapshot and coalesces a burst',async()=>{
  const cache=new QueryClient({defaultOptions:{queries:{retry:false}}});
  let resolve!:(value:number)=>void;const queryFn=vi.fn(()=>new Promise<number>(r=>{resolve=r;}));
  const observer=new QueryObserver(cache,{queryKey:['chat-messages','c1'],queryFn});const off=observer.subscribe(()=>{});
  expect(queryFn).toHaveBeenCalledOnce();
  for(let i=0;i<20;i++)refreshChatQueries(cache,{queryKey:['chat-messages','c1']});
  expect(queryFn).toHaveBeenCalledOnce();resolve(1);await settle();expect(queryFn).toHaveBeenCalledTimes(2);
  resolve(2);await settle();expect(cache.getQueryData(['chat-messages','c1'])).toBe(2);expect(queryFn).toHaveBeenCalledTimes(2);off();cache.clear();
 });
 it('does not restart a slow refresh; one trailing request catches later events',async()=>{
  const cache=new QueryClient();cache.setQueryData(['chat-messages','c1'],0);
  const signals:AbortSignal[]=[];let resolve!:(value:number)=>void;
  const queryFn=vi.fn(({signal}:{signal:AbortSignal})=>{signals.push(signal);return new Promise<number>(r=>{resolve=r;});});
  const observer=new QueryObserver(cache,{queryKey:['chat-messages','c1'],queryFn,staleTime:Infinity});const off=observer.subscribe(()=>{});
  refreshChatQueries(cache,{queryKey:['chat-messages','c1']});
  for(let i=0;i<10;i++)refreshChatQueries(cache,{queryKey:['chat-messages','c1']});
  expect(queryFn).toHaveBeenCalledOnce();expect(signals[0].aborted).toBe(false);
  resolve(1);await settle();expect(queryFn).toHaveBeenCalledTimes(2);resolve(2);await settle();off();cache.clear();
 });
 it('pending refresh cannot restore a query removed on logout',async()=>{
  const cache=new QueryClient();let resolve!:(value:number)=>void;
  const queryFn=vi.fn(()=>new Promise<number>(r=>{resolve=r;}));const observer=new QueryObserver(cache,{queryKey:['chat-messages','c1'],queryFn});const off=observer.subscribe(()=>{});
  refreshChatQueries(cache,{queryKey:['chat-messages','c1']});cache.removeQueries({queryKey:['chat-messages','c1']});resolve(1);await settle();
  expect(queryFn).toHaveBeenCalledOnce();expect(cache.getQueryData(['chat-messages','c1'])).toBeUndefined();off();cache.clear();
 });
});
