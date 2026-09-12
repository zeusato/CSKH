import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {QueryClient,QueryObserver} from '@tanstack/react-query';
import type {CatalogItem,Catalogs} from './types';
const mock=vi.hoisted(()=>({from:vi.fn(),insert:vi.fn(),update:vi.fn(),delete:vi.fn(),eq:vi.fn(),select:vi.fn(),single:vi.fn(),maybeSingle:vi.fn()}));
vi.mock('./supabase',()=>({supabase:{from:mock.from}}));
import {saveCatalog,deleteCatalog} from './catalog-mutations';

function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const old:CatalogItem={id:'old',name:'Existing department',created_at:'2026-09-12T00:00:00Z',created_by:'creator'};
const row:CatalogItem={id:'server-id',name:'New department',created_at:'2026-09-12T01:00:00Z',created_by:'creator'};
const initial=():Catalogs=>({categories:[],departments:[old],systems:[],staff:[],app_users:[]});
let cache:QueryClient;let unsubscribe:(()=>void)|undefined;
beforeEach(()=>{vi.resetAllMocks();cache=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity,staleTime:Infinity}}});cache.setQueryData(['catalogs'],initial());for(const name of ['from','insert','update','delete','eq','select'] as const)mock[name].mockReturnValue(mock);vi.spyOn(console,'debug').mockImplementation(()=>{});});
afterEach(()=>{unsubscribe?.();unsubscribe=undefined;cache.clear();vi.restoreAllMocks();});

describe('Catalog save acknowledgement',()=>{
 it('waits for the write, but finishes while the background list request is still pending',async()=>{
  const write=deferred<{data:CatalogItem;error:null}>(),reload=deferred<Catalogs>();
  mock.single.mockReturnValue(write.promise);
  const observer=new QueryObserver(cache,{queryKey:['catalogs'],queryFn:()=>reload.promise});unsubscribe=observer.subscribe(()=>{});
  let completed=false;const saving=saveCatalog(cache,'departments',{name:row.name}).then(value=>{completed=true;return value;});
  await Promise.resolve();expect(completed).toBe(false);expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toEqual([old]);
  write.resolve({data:row,error:null});expect(await saving).toEqual(row);
  expect(completed).toBe(true);expect(cache.getQueryState(['catalogs'])?.fetchStatus).toBe('fetching');
  expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toContainEqual(row);
 });
 it('keeps the saved record and resolves successfully even when list refresh fails',async()=>{
  mock.single.mockResolvedValue({data:row,error:null});
  const observer=new QueryObserver(cache,{queryKey:['catalogs'],queryFn:async()=>{throw new Error('List request failed');}});unsubscribe=observer.subscribe(()=>{});
  await expect(saveCatalog(cache,'departments',{name:row.name})).resolves.toEqual(row);
  await vi.waitFor(()=>expect(cache.getQueryState(['catalogs'])?.status).toBe('error'));
  expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toContainEqual(row);
 });
 it('does not report a failed write as saved or change cached data',async()=>{
  const error={message:'permission denied'};mock.single.mockResolvedValue({data:null,error});
  await expect(saveCatalog(cache,'systems',{name:'Restricted'})).rejects.toEqual(error);
  expect(cache.getQueryData(['catalogs'])).toEqual(initial());
 });
 it('cancels an older list response so it cannot erase a just-saved record',async()=>{
  const stale=deferred<Catalogs>(),fresh=deferred<Catalogs>();let requests=0;
  const observer=new QueryObserver(cache,{queryKey:['catalogs'],queryFn:()=>++requests===1?stale.promise:fresh.promise});unsubscribe=observer.subscribe(()=>{});
  const oldRequest=observer.refetch();mock.single.mockResolvedValue({data:row,error:null});
  await saveCatalog(cache,'departments',{name:row.name});
  stale.resolve(initial());await oldRequest;
  expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toContainEqual(row);
 });
 it('replaces a renamed record using server data without duplicating it',async()=>{
  const renamed={...old,name:'Renamed'};mock.single.mockResolvedValue({data:renamed,error:null});
  await saveCatalog(cache,'departments',{name:renamed.name},old.id);
  expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toEqual([renamed]);
 });
 it('removes a row only after server confirms deletion; denied deletion preserves it',async()=>{
  mock.maybeSingle.mockResolvedValueOnce({data:null,error:null});
  await expect(deleteCatalog(cache,'departments',old)).rejects.toThrow('Không thể xóa');
  expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toEqual([old]);
  mock.maybeSingle.mockResolvedValueOnce({data:{id:old.id},error:null});
  await deleteCatalog(cache,'departments',old);
  expect(cache.getQueryData<Catalogs>(['catalogs'])?.departments).toEqual([]);
 });
});
