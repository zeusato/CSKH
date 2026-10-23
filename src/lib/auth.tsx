import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import type { Profile } from './types';
import { errorMessage } from './utils';
import {callAccess} from './call-log-types';
import { careAccess } from './care-log-types';
import { chatAccess } from './chat/access';
type AuthValue={session:Session|null;profile:Profile|null;loading:boolean;error:string|null;recovery:boolean;setRecovery:(value:boolean)=>void;refresh:()=>Promise<void>;signOut:()=>Promise<void>};
const AuthContext=createContext<AuthValue>(null!);
export function AuthProvider({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null>(null);const [profile,setProfile]=useState<Profile|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState<string|null>(null);const [recovery,setRecovery]=useState(location.hash.includes('type=recovery'));const cache=useQueryClient();
 const requestVersion=useRef(0);
 const lastCareAccess=useRef('none');
 async function loadProfile(s:Session|null){
  const version=++requestVersion.current;
  setSession(s);
  if(!s){setProfile(null);setError(null);setLoading(false);cache.clear();return;}
  const {data,error:e}=await supabase.from('app_users').select('*').eq('id',s.user.id).maybeSingle();
  if(version!==requestVersion.current)return;
  if(e){setProfile(previous=>previous?.id===s.user.id?previous:null);setError(errorMessage(e));setLoading(false);return;}
  if(!data)cache.clear();
  const access=`${data?.id}-${data?.active}-${data?.role}-${careAccess(data)}-${callAccess(data)}-${chatAccess(data)}`;
  if(access!==lastCareAccess.current){await cache.cancelQueries({predicate:q=>/^(care-|library|call-|chat-)/.test(String(q.queryKey[0]))});cache.removeQueries({predicate:q=>/^(care-|library|call-|chat-)/.test(String(q.queryKey[0]))});lastCareAccess.current=access;}
  if(version!==requestVersion.current)return;
  setProfile(data);setError(!data?'Tài khoản chưa được cấp quyền hoặc đã bị khóa. Liên hệ quản trị viên CSKH.':null);setLoading(false);
 }
 useEffect(()=>{
  let alive=true;
  void supabase.auth.getSession().then(({data})=>{if(alive)void loadProfile(data.session);});
  const {data}=supabase.auth.onAuthStateChange((event,s)=>{if(event==='PASSWORD_RECOVERY')setRecovery(true);if(event==='SIGNED_OUT')cache.clear();setTimeout(()=>{if(alive)void loadProfile(s);},0);});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')void supabase.auth.getSession().then(({data})=>{if(alive)void loadProfile(data.session);});},30000);
  return()=>{alive=false;clearInterval(timer);data.subscription.unsubscribe();};
 },[]);
 return <AuthContext.Provider value={{session,profile,loading,error,recovery,setRecovery,refresh:async()=>{await loadProfile((await supabase.auth.getSession()).data.session);},signOut:async()=>{await supabase.auth.signOut();setRecovery(false);cache.clear();}}}>{children}</AuthContext.Provider>;
}
export const useAuth=()=>useContext(AuthContext);
