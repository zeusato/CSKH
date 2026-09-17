import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {describe,it,expect,vi} from 'vitest';
function api(role='admin',active=true){
 let serve!:(req:Request)=>Promise<Response>;
 const insert=vi.fn(async()=>({error:null})),update=vi.fn(()=>({eq:async()=>({error:null})})),createUser=vi.fn(async()=>({data:{user:{id:'new'}}}));
 const table={select:()=>({eq:()=>({single:async()=>({data:{role,active}}),maybeSingle:async()=>({data:{id:'target'}})})}),insert,update};
 const service={from:()=>table,auth:{getUser:async()=>({data:{user:{id:'admin-id'}}}),admin:{createUser,deleteUser:vi.fn()}}};
 const source=stripTypeScriptTypes(readFileSync('supabase/functions/admin-users/index.ts','utf8').replace(/^import .*;\r?\n/,''));
 new Function('createClient','Deno',source)(()=>service,{env:{get:()=>''},serve:(handler:typeof serve)=>{serve=handler;}});
 return {insert,update,createUser,request:(body:Record<string,unknown>)=>serve(new Request('https://fixture.test',{method:'POST',headers:{Authorization:'Bearer fixture','Content-Type':'application/json'},body:JSON.stringify({id:'00000000-0000-0000-0000-000000000001',name:'Fixture',email:'fixture@example.test',password:'Fixture123!',role:'user',...body})}))};
}
describe('Admin care access changes',()=>{
 it('creates a writer with the requested care access',async()=>{const a=api();expect((await a.request({action:'create',care_log_access:'write'})).status).toBe(200);expect(a.insert).toHaveBeenCalledWith(expect.objectContaining({care_log_access:'write',role:'user'}));});
 it('rejects viewer/write before creating an Auth user',async()=>{const a=api();expect((await a.request({action:'create',role:'viewer',care_log_access:'write'})).status).toBe(400);expect(a.createUser).not.toHaveBeenCalled();});
 it('updates role/access in one profile write and rejects invalid values',async()=>{const a=api();expect((await a.request({action:'update',role:'viewer',care_log_access:'read'})).status).toBe(200);expect(a.update).toHaveBeenCalledWith(expect.objectContaining({role:'viewer',care_log_access:'read'}));expect((await a.request({action:'update',care_log_access:'admin'})).status).toBe(400);});
 it('defaults to no care access and gives admin access via role',async()=>{const a=api();await a.request({action:'create'});expect(a.insert).toHaveBeenLastCalledWith(expect.objectContaining({care_log_access:'none'}));await a.request({action:'create',role:'admin',care_log_access:'write'});expect(a.insert).toHaveBeenLastCalledWith(expect.objectContaining({care_log_access:'none',role:'admin'}));});
 for(const [role,active] of [['user',true],['admin',false]] as const)it(`denies caller ${role}/${active}`,async()=>{const a=api(role,active);expect((await a.request({action:'update',care_log_access:'write'})).status).toBe(403);expect(a.update).not.toHaveBeenCalled();});
});
