// Cờ bật/tắt phân hệ (public.feature_flags). Admin đổi trên trang Tài khoản; giao diện đọc lại mỗi phút và khi quay lại tab.
import { useQuery } from '@tanstack/react-query';
import { supabase } from './supabase';
export const chatRolloutEnabled=import.meta.env.VITE_CHAT_MODULE_ENABLED==='true';
export type FeatureKey='chat_module';
export type FeatureFlag={key:FeatureKey;enabled:boolean;updated_at:string;updated_by:string|null};
export const featureLabels:Record<FeatureKey,string>={chat_module:'Chat khách hàng'};
export async function getFeatureFlags():Promise<FeatureFlag[]>{const {data,error}=await supabase.from('feature_flags').select('key,enabled,updated_at,updated_by');if(error)throw error;return data as FeatureFlag[];}
export async function setFeatureFlag(key:FeatureKey,enabled:boolean){const {data,error}=await supabase.from('feature_flags').update({enabled}).eq('key',key).select('key');if(error)throw error;if(!data?.length)throw new Error('Chỉ quản trị viên được bật/tắt phân hệ.');}
// Cờ chưa tải xong hoặc lỗi đọc thì coi như tắt: phân hệ chưa sẵn sàng không bao giờ lộ ra.
export function useFeatures(enabled=true){
 const q=useQuery({queryKey:['feature-flags'],queryFn:getFeatureFlags,enabled,staleTime:30000,refetchInterval:60000});
 const on=(key:FeatureKey)=>chatRolloutEnabled&&q.data?.find(f=>f.key===key)?.enabled===true;
 return {flags:q.data??[],loading:q.isPending&&enabled,on,query:q};
}
