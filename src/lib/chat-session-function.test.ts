import {createPublicKey,generateKeyPairSync,verify} from 'node:crypto';
import {stripTypeScriptTypes} from 'node:module';
import {describe,it,expect} from 'vitest';
import {bundleFunctionSync} from '../../scripts/function-bundle.mjs';
const {publicKey,privateKey}=generateKeyPairSync('ed25519');
const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString('base64url');
const token=(claims:object)=>`${b64({alg:'HS256'})}.${b64(claims)}.sig`;
const good=token({sub:'u1',session_id:'sess-1',exp:Math.floor(Date.now()/1000)+3600});
// Chạy đúng bản bundle sẽ deploy của chat-session (CHAT-PLAN §4, test-chat-session) với Supabase giả.
function fn(profile:Record<string,unknown>|null,{authOk=true,env={}}:{authOk?:boolean;env?:Record<string,string>}={}){
 let serve!:(req:Request)=>Promise<Response>;
 const service={auth:{getUser:async()=>authOk?{data:{user:{id:'u1'}},error:null}:{data:{user:null},error:{message:'bad'}}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:profile,error:null})})})})};
 const values:Record<string,string>={CHAT_ALLOWED_ORIGINS:'https://cskh.example,http://127.0.0.1:5173',CHAT_ASSERTION_PRIVATE_KEY:privateKey.export({format:'pem',type:'pkcs8'}).toString(),CHAT_ASSERTION_KID:'dev',CHAT_GATEWAY_URL:'http://127.0.0.1:8080',SUPABASE_URL:'https://x.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',...env};
 new Function('createClient','Deno',stripTypeScriptTypes(bundleFunctionSync('chat-session').replace(/^import .*;\r?\n/,'')))(()=>service,{env:{get:(k:string)=>values[k]},serve:(h:typeof serve)=>{serve=h;}});
 return (auth:string|null=good,origin:string|null='https://cskh.example',method='POST')=>serve(new Request('https://fn.test',{method,headers:{...(auth?{Authorization:`Bearer ${auth}`}:{}),...(origin?{Origin:origin}:{})}}));
}
const user={id:'u1',name:'Trần Thị B',role:'user',active:true,chat_access:'agent'};
describe('Edge Function chat-session',()=>{
 it('tài khoản hợp lệ → assertion verify được, đủ claim, không có roles; no-store; CORS đúng origin',async()=>{
  const res=await fn(user)();expect(res.status).toBe(200);expect(res.headers.get('Cache-Control')).toBe('no-store');expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://cskh.example');
  const body=await res.json();expect(body.gatewayUrl).toBe('http://127.0.0.1:8080/v1/chat');const [h,p,s]=body.assertion.split('.');
  expect(verify(null,Buffer.from(`${h}.${p}`),createPublicKey(publicKey.export({format:'pem',type:'spki'})),Buffer.from(s,'base64url'))).toBe(true);
  const claims=JSON.parse(Buffer.from(p,'base64url').toString());expect(JSON.parse(Buffer.from(h,'base64url').toString()).kid).toBe('dev');
  expect(claims).toMatchObject({iss:'cskh-desk',aud:'chat-gateway',sub:'u1',kind:'staff',name:'Trần Thị B',sid:'sess-1'});expect(claims.exp-claims.iat).toBe(60);
  for(const k of ['roles','queue_ids','account_refs'])expect(claims).not.toHaveProperty(k);
 });
 it('gọi hai lần ra hai jti khác nhau',async()=>{const call=fn(user);const jti=async()=>JSON.parse(Buffer.from((await (await call()).json()).assertion.split('.')[1],'base64url').toString()).jti;expect(await jti()).not.toBe(await jti());});
 it('chưa có quyền, bị khóa, hoặc Admin chưa tự bật → 403',async()=>{for(const p of [{...user,chat_access:'none'},{...user,active:false},{...user,role:'admin',chat_access:'none'},null])expect((await fn(p)()).status).toBe(403);});
 it('viewer có read → 200; viewer có agent (dữ liệu sai) → 403',async()=>{expect((await fn({...user,role:'viewer',chat_access:'read'})()).status).toBe(200);expect((await fn({...user,role:'viewer',chat_access:'agent'})()).status).toBe(403);});
 it('token sai hoặc thiếu → 401',async()=>{expect((await fn(user,{authOk:false})()).status).toBe(401);expect((await fn(user)(null)).status).toBe(401);});
 it('origin lạ bị chặn, kể cả preflight',async()=>{expect((await fn(user)(good,'https://evil.example')).status).toBe(403);expect((await fn(user)(good,'https://evil.example','OPTIONS')).status).toBe(403);expect((await fn(user)(good,'http://127.0.0.1:5173','OPTIONS')).status).toBe(200);});
 it('thiếu secret → 503, không lộ chi tiết',async()=>{const res=await fn(user,{env:{CHAT_ASSERTION_PRIVATE_KEY:''}})();expect(res.status).toBe(503);expect(await res.json()).toEqual({error:'Chưa cấu hình Chat Gateway.'});});
});
