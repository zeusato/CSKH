import type { QueryClient,QueryFilters } from '@tanstack/react-query';

// An event can arrive while the first snapshot is still loading. Let that request
// finish, then fetch once more; cancelling every burst can starve a slow Gateway.
const queued=new WeakSet<object>();
export function refreshChatQueries(cache:QueryClient,filters:QueryFilters){
 for(const query of cache.getQueryCache().findAll(filters)){
  const exact={queryKey:query.queryKey,exact:true};
  void cache.invalidateQueries({...exact,refetchType:'none'});
  if(queued.has(query))continue;
  if(query.state.fetchStatus==='fetching'&&query.promise){
   queued.add(query);
   void query.promise.catch(()=>{}).then(()=>{
    queued.delete(query);
    // Logout/access changes may have removed this exact cache instance.
    if(cache.getQueryCache().find(exact)===query)void cache.invalidateQueries(exact,{cancelRefetch:false});
   });
  }else void cache.invalidateQueries(exact,{cancelRefetch:false});
 }
}
