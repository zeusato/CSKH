import { describe,expect,it } from 'vitest';
import { createPublicKey,generateKeyPairSync,verify } from 'node:crypto';
import { assertionClaims,chatAccessAllowed,chatEntitled,gatewayBase,importSigningKey,jwtPayload,needsChatSync,orphanSubjects,originAllowed,signAssertion,syncStaff,type ChatProfile } from './chat-gateway';
const agent:ChatProfile={id:'00000000-0000-0000-0000-000000000002',name:'Trần Thị B',role:'user',active:true,chat_access:'agent'};
const b64=(o:object)=>Buffer.from(JSON.stringify(o)).toString('base64url');
function fakeFetch(status:number,body:unknown=null){const calls:{url:string;init:RequestInit}[]=[];const f=(async(url:string,init:RequestInit)=>{calls.push({url,init});return new Response(body===null?null:JSON.stringify(body),{status});}) as unknown as typeof fetch;return {f,calls};}
describe('quyền chat',()=>{
 it('viewer chỉ được none/read, giá trị lạ bị từ chối',()=>{expect(chatAccessAllowed('viewer','read')).toBe(true);expect(chatAccessAllowed('viewer','agent')).toBe(false);expect(chatAccessAllowed('admin','supervisor')).toBe(true);expect(chatAccessAllowed('user','owner')).toBe(false);});
 it('khóa tài khoản hoặc none thì hết quyền, admin không mặc nhiên có quyền',()=>{expect(chatEntitled(agent)).toBe(true);expect(chatEntitled({...agent,active:false})).toBe(false);expect(chatEntitled({...agent,role:'admin',chat_access:'none'})).toBe(false);expect(chatEntitled({...agent,role:'viewer'})).toBe(false);});
 it('chỉ đồng bộ khi tên, vai trò, trạng thái hoặc quyền chat đổi',()=>{expect(needsChatSync({department_id:'x'})).toBe(false);expect(needsChatSync({name:'A'})).toBe(true);expect(needsChatSync({active:false})).toBe(true);});
 it('chuẩn hóa URL Gateway',()=>{expect(gatewayBase('http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080/v1/chat');expect(gatewayBase('https://g.example/v1/chat')).toBe('https://g.example/v1/chat');});
 it('origin: request không có Origin (server) được qua, origin lạ bị chặn',()=>{expect(originAllowed(null,['https://a'])).toBe(true);expect(originAllowed('https://evil',['https://a'])).toBe(false);});
});
describe('đồng bộ sổ đăng ký',()=>{
 const o=(f:typeof fetch)=>({gatewayUrl:'http://gw',adminKey:'admin-secret',fetch:f});
 it('PUT đúng đường dẫn, vai trò và queue',async()=>{const {f,calls}=fakeFetch(200,{});expect(await syncStaff(agent,o(f))).toEqual({ok:true});expect(calls[0].url).toBe(`http://gw/v1/chat/admin/staff/cskh-desk/${agent.id}`);expect(calls[0].init.method).toBe('PUT');expect(JSON.parse(String(calls[0].init.body))).toEqual({displayName:'Trần Thị B',roles:['agent'],queueIds:['support-default']});expect((calls[0].init.headers as Record<string,string>).authorization).toBe('Bearer admin-secret');});
 it('read → observer, supervisor → supervisor',async()=>{for(const [access,role] of [['read','observer'],['supervisor','supervisor']] as const){const {f,calls}=fakeFetch(200,{});await syncStaff({...agent,chat_access:access},o(f));expect(JSON.parse(String(calls[0].init.body)).roles).toEqual([role]);}});
 it('khóa hoặc gỡ quyền → DELETE, 404 coi là thành công',async()=>{const {f,calls}=fakeFetch(404,{code:'NOT_FOUND'});expect(await syncStaff({...agent,active:false},o(f))).toEqual({ok:true});expect(calls[0].init.method).toBe('DELETE');});
 it('lỗi Gateway trả thông báo ngắn kèm code, không ném lỗi',async()=>{const {f}=fakeFetch(422,{code:'VALIDATION_FAILED',message:'chi tiết dev'});expect(await syncStaff(agent,o(f))).toEqual({ok:false,revoke:false,error:'Gateway HTTP 422 VALIDATION_FAILED'});const down=(async()=>{throw new TypeError('fetch failed');}) as unknown as typeof fetch;expect(await syncStaff({...agent,chat_access:'none'},o(down))).toEqual({ok:false,revoke:true,error:'Không kết nối được Gateway'});});
 it('timeout được báo rõ',async()=>{const hang=((_u:string,init:RequestInit)=>new Promise((_,reject)=>init.signal!.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}))))) as unknown as typeof fetch;expect(await syncStaff(agent,{...o(hang),timeoutMs:5})).toMatchObject({ok:false,error:'Gateway không phản hồi sau 10 giây'});});
 it('đăng ký mồ côi: chỉ subject active của cskh-desk không còn trong DB',()=>{const reg=(subject:string,more={})=>({issuer:'cskh-desk',subject,displayName:null,roles:['agent'],queueIds:['support-default'],status:'active' as const,updatedAt:'',...more});expect(orphanSubjects([agent],[reg(agent.id),reg('gone'),reg('old',{status:'disabled'}),reg('x',{issuer:'shone-app'})])).toEqual(['gone']);});
});
describe('assertion staff',()=>{
 const supabaseToken=`${b64({alg:'HS256'})}.${b64({sub:agent.id,session_id:'sess-1',exp:2000000000})}.sig`;
 it('đủ claim, không có roles/queue_ids/account_refs, hạn 60 giây',()=>{const c=assertionClaims(agent,jwtPayload(supabaseToken),1900000000,'jti-1');expect(c).toEqual({iss:'cskh-desk',aud:'chat-gateway',sub:agent.id,kind:'staff',name:'Trần Thị B',sid:'sess-1',sid_exp:2000000000,jti:'jti-1',iat:1900000000,exp:1900000060});});
 it('từ chối token thiếu session_id hoặc đã hết hạn',()=>{expect(()=>assertionClaims(agent,{exp:2000000000},1900000000,'j')).toThrow();expect(()=>assertionClaims(agent,{session_id:'s',exp:10},1900000000,'j')).toThrow();});
 it('chữ ký EdDSA verify được bằng public key, header có kid; PEM có \\n thoát vẫn đọc được',async()=>{
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');const pem=privateKey.export({format:'pem',type:'pkcs8'}).toString();
  for(const source of [pem,pem.replace(/\n/g,'\\n')]){
   const jwt=await signAssertion({sub:agent.id,jti:'a'},await importSigningKey(source),'dev');const [h,p,s]=jwt.split('.');
   expect(JSON.parse(Buffer.from(h,'base64url').toString())).toEqual({alg:'EdDSA',typ:'JWT',kid:'dev'});expect(JSON.parse(Buffer.from(p,'base64url').toString()).sub).toBe(agent.id);
   expect(verify(null,Buffer.from(`${h}.${p}`),createPublicKey(publicKey.export({format:'pem',type:'spki'})),Buffer.from(s,'base64url'))).toBe(true);
  }
 });
});
