import {stripTypeScriptTypes} from 'node:module';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {bundleFunctionSync} from '../../scripts/function-bundle.mjs';
type Row=Record<string,unknown>&{id:string};
const target='00000000-0000-0000-0000-000000000002';
// Chạy đúng bản bundle sẽ deploy của admin-users, với Supabase và Chat Gateway giả.
function api({row={},gateway=200,configured=true,chatEnabled=true,registrations=[] as unknown[]}:{row?:Partial<Row>;gateway?:number;configured?:boolean;chatEnabled?:boolean;registrations?:unknown[]}={}){
 let serve!:(req:Request)=>Promise<Response>;
 const rows=new Map<string,Row>([['admin-id',{id:'admin-id',name:'Admin',role:'admin',active:true,chat_access:'none'}],[target,{id:target,name:'Trần Thị B',role:'user',active:true,chat_access:'none',chat_synced_at:null,chat_sync_error:null,...row}]]);
 const writes:Row[]=[];
 const from=(table:string)=>table==='feature_flags'?{select:()=>({eq:()=>({maybeSingle:async()=>({data:{enabled:chatEnabled},error:null})})})}:({
  select:()=>{const all=Promise.resolve({data:[...rows.values()].filter(r=>r.id!=='admin-id'),error:null});return Object.assign(all,{eq:(_k:string,id:string)=>({single:async()=>({data:rows.get(id)??null,error:rows.get(id)?null:{message:'missing'}}),maybeSingle:async()=>({data:rows.get(id)??null})})});},
  update:(values:Row)=>({eq:async(_k:string,id:string)=>{writes.push({...values,id});Object.assign(rows.get(id)!,values);return {error:null};}}),
  insert:async(values:Row)=>{rows.set(values.id,{chat_synced_at:null,chat_sync_error:null,active:true,...values});return {error:null};},
 });
 const service={from,auth:{getUser:async()=>({data:{user:{id:'admin-id'}}}),admin:{createUser:vi.fn(async()=>({data:{user:{id:'00000000-0000-0000-0000-000000000009'}}})),deleteUser:vi.fn()}}};
 const calls:{method:string;url:string;body:unknown}[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,init:RequestInit)=>{calls.push({method:String(init.method),url,body:init.body?JSON.parse(String(init.body)):undefined});
  if(init.method==='GET')return new Response(JSON.stringify({items:registrations}),{status:200});
  return new Response(gateway===204?null:JSON.stringify(gateway<300?{}:{code:'DEPENDENCY_FAILED'}),{status:gateway});}));
 const env:Record<string,string>=configured?{CHAT_GATEWAY_URL:'http://gw.test',CHAT_ADMIN_KEY:'admin-key'}:{};
 const source=stripTypeScriptTypes(bundleFunctionSync('admin-users').replace(/^import .*;\r?\n/,''));
 new Function('createClient','Deno',source)(()=>service,{env:{get:(k:string)=>env[k]??''},serve:(h:typeof serve)=>{serve=h;}});
 const request=async(body:Record<string,unknown>)=>{const res=await serve(new Request('https://fixture.test',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({id:target,...body})}));return {status:res.status,body:await res.json()};};
 return {rows,writes,calls,request,service};
}
afterEach(()=>vi.unstubAllGlobals());
describe('admin-users: quyền Chat',()=>{
 it('bật quyền → ghi DB rồi PUT sổ đăng ký, lưu mốc đồng bộ',async()=>{const a=api();const r=await a.request({action:'update',chat_access:'agent'});expect(r.body).toMatchObject({ok:true,chatSync:'ok'});expect(a.rows.get(target)).toMatchObject({chat_access:'agent',chat_sync_error:null});expect(a.rows.get(target)!.chat_synced_at).toBeTruthy();expect(a.calls).toEqual([{method:'PUT',url:`http://gw.test/v1/chat/admin/staff/cskh-desk/${target}`,body:{displayName:'Trần Thị B',roles:['agent'],queueIds:['support-default']}}]);});
 it('Gateway lỗi: DB vẫn ghi, response ok kèm chatSync failed và lỗi ngắn',async()=>{const a=api({gateway:503});const r=await a.request({action:'update',chat_access:'supervisor'});expect(r.status).toBe(200);expect(r.body).toMatchObject({ok:true,chatSync:'failed',chatRevoke:false});expect(a.rows.get(target)).toMatchObject({chat_access:'supervisor',chat_sync_error:'Gateway HTTP 503 DEPENDENCY_FAILED'});});
 it('khóa tài khoản đang có quyền → DELETE; lỗi thì báo chatRevoke để UI hiện đỏ',async()=>{const ok=api({row:{chat_access:'agent',chat_synced_at:'2026-10-23T00:00:00Z'},gateway:204});await ok.request({action:'update',active:false});expect(ok.calls[0].method).toBe('DELETE');const bad=api({row:{chat_access:'agent',chat_synced_at:'2026-10-23T00:00:00Z'},gateway:500});expect((await bad.request({action:'update',active:false})).body).toMatchObject({chatSync:'failed',chatRevoke:true});});
 it('đổi sang Chỉ xem khi đang là Nhân viên → 400 tiếng Việt, không ghi DB',async()=>{const a=api({row:{chat_access:'agent'}});const r=await a.request({action:'update',role:'viewer'});expect(r.status).toBe(400);expect(r.body.error).toMatch(/Chỉ xem/);expect(a.writes).toEqual([]);expect((await a.request({action:'update',role:'viewer',chat_access:'read'})).status).toBe(200);expect(a.calls.at(-1)!.body).toMatchObject({roles:['observer']});});
 it('đổi phòng ban không gọi Gateway; tài khoản chưa từng có quyền không gọi DELETE thừa',async()=>{const a=api();await a.request({action:'update',department_id:null});await a.request({action:'update',name:'Tên mới'});expect(a.calls).toEqual([]);});
 it('đổi tên người đang có quyền → PUT displayName mới',async()=>{const a=api({row:{chat_access:'read',chat_synced_at:'2026-10-23T00:00:00Z'}});await a.request({action:'update',name:'Tên mới'});expect(a.calls[0]).toMatchObject({method:'PUT',body:{displayName:'Tên mới',roles:['observer']}});});
 it('Admin không bị ép chat_access về none; viewer tạo với agent bị từ chối trước khi tạo Auth',async()=>{const a=api();await a.request({action:'create',name:'Admin 2',email:'a2@example.test',password:'Fixture123!',role:'admin',chat_access:'supervisor'});expect(a.rows.get('00000000-0000-0000-0000-000000000009')).toMatchObject({chat_access:'supervisor',care_log_access:'none'});expect(a.calls[0].method).toBe('PUT');const v=api();expect((await v.request({action:'create',name:'V',email:'v@example.test',password:'Fixture123!',role:'viewer',chat_access:'agent'})).status).toBe(400);expect(v.service.auth.admin.createUser).not.toHaveBeenCalled();});
 it('chưa cấu hình Gateway → ghi lỗi để Admin thấy, không giả vờ thành công',async()=>{const a=api({configured:false});expect((await a.request({action:'update',chat_access:'agent'})).body).toMatchObject({chatSync:'failed',chatSyncError:'Chưa cấu hình Chat Gateway'});expect(a.calls).toEqual([]);});
 it('sync-chat {all} đối soát hai chiều: PUT người có quyền, DELETE đăng ký mồ côi',async()=>{const reg=(subject:string)=>({issuer:'cskh-desk',subject,displayName:null,roles:['agent'],queueIds:['support-default'],status:'active',updatedAt:''});const a=api({row:{chat_access:'agent'},registrations:[reg(target),reg('deleted-user')]});const r=await a.request({action:'sync-chat',all:true});expect(r.body).toMatchObject({ok:true,synced:1,failed:0,orphansRemoved:1});expect(a.calls.map(c=>`${c.method} ${c.url.split('/').pop()}`)).toEqual(['GET staff',`PUT ${target}`,'DELETE deleted-user']);});
 it('sync-chat {id} luôn gọi Gateway để thử lại',async()=>{const a=api({row:{chat_access:'none',chat_sync_error:'Gateway HTTP 500'}});expect((await a.request({action:'sync-chat'})).body).toMatchObject({chatSync:'ok'});expect(a.calls[0].method).toBe('DELETE');expect(a.rows.get(target)!.chat_sync_error).toBeNull();});
});

it('paused chat blocks manual sync and lets ordinary account edits/locks proceed without Gateway',async()=>{
 const a=api({chatEnabled:false,row:{chat_access:'agent',chat_synced_at:'2026-10-23T00:00:00Z'}});
 for(const body of [{action:'sync-chat',all:true},{action:'sync-chat'}])expect((await a.request(body)).status).toBe(403);
 expect((await a.request({action:'update',name:'Updated',chat_access:'supervisor'})).body).toMatchObject({ok:true,chatSync:'skipped'});
 expect(a.rows.get(target)?.chat_access).toBe('agent');
 expect((await a.request({action:'update',active:false})).status).toBe(200);
 expect((await a.request({action:'update',role:'viewer'})).status).toBe(200);
 expect(a.rows.get(target)).toMatchObject({active:false,role:'viewer',chat_access:'read'});
 expect(a.calls).toEqual([]);
});
