// Kịch bản nghiệm thu CHAT-PLAN §8.2 với Chat Gateway local thật (Chat-server `npm run dev:local`). Chỉ persona tổng hợp.
// Bỏ qua khi không có CHAT_IT_GATEWAY. Xem docs/CHAT.md mục "Kiểm thử với Gateway local".
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll,describe,expect,it } from 'vitest';
import { assertionClaims,importSigningKey,signAssertion,syncStaff,type ChatProfile } from '../../../supabase/functions/_shared/chat-gateway';
import { act,getConversation,listMembers,listMessages,listQueue,markRead,sendMessage } from './api';
import type { ChatEvent,Conversation,Message } from './contract';
import { ChatRealtime } from './realtime';
import { ChatError,ChatSession } from './session';
const gateway=process.env.CHAT_IT_GATEWAY,base=`${gateway}/v1/chat`;
const run=Boolean(gateway)?describe:describe.skip;
const until=async<T>(fn:()=>Promise<T|undefined|false>,ms=8000)=>{const end=Date.now()+ms;for(;;){const v=await fn().catch(()=>undefined);if(v)return v;if(Date.now()>end)throw new Error('Hết thời gian chờ');await new Promise(r=>setTimeout(r,150));}};
run('Chat Gateway local — kịch bản nghiệm thu',()=>{
 const tag=Date.now().toString(36);const uid=(n:number)=>`00000000-0000-4000-8000-${tag.padStart(8,'0').slice(-8)}${String(n).padStart(4,'0')}`;
 const staff:Record<string,ChatProfile>={nv1:{id:uid(1),name:'NV1 Tổng hợp',role:'user',active:true,chat_access:'agent'},nv2:{id:uid(2),name:'NV2 Tổng hợp',role:'user',active:true,chat_access:'agent'},sup:{id:uid(3),name:'GS Tổng hợp',role:'user',active:true,chat_access:'supervisor'},obs:{id:uid(4),name:'Xem Tổng hợp',role:'viewer',active:true,chat_access:'read'}};
 // describe.skip vẫn chạy thân hàm để thu thập test: chỉ đọc khóa khi có Gateway.
 const admin={gatewayUrl:gateway!,adminKey:gateway?readFileSync(process.env.CHAT_IT_ADMIN_KEY_FILE!,'utf8').trim():''};
 const key=gateway?importSigningKey(readFileSync(process.env.CHAT_IT_KEY_FILE!,'utf8')):Promise.reject(new Error('no gateway'));key.catch(()=>{});
 const sessions:ChatSession[]=[];const sockets:ChatRealtime[]=[];
 // Thay Edge Function chat-session: ký assertion cskh-desk bằng khóa local.
 const staffSession=(p:ChatProfile)=>{const s=new ChatSession({getProof:async()=>({assertion:await signAssertion(assertionClaims(p,{session_id:`sid-${p.id}`,exp:Math.floor(Date.now()/1000)+3600},Math.floor(Date.now()/1000),crypto.randomUUID()),await key,'dev'),gatewayUrl:base})});sessions.push(s);return s;};
 const customerProof=()=>execFileSync(process.execPath,['--experimental-strip-types','--no-warnings=ExperimentalWarning','scripts/dev-proof.ts','customerA'],{cwd:process.env.CHAT_IT_SERVER_DIR,encoding:'utf8'}).trim();
 const customer=new ChatSession({getProof:async()=>({assertion:customerProof(),gatewayUrl:base})});sessions.push(customer);
 const s:Record<string,ChatSession>={};let conversation:Conversation;const events:ChatEvent[]=[];
 afterAll(async()=>{sockets.forEach(x=>x.stop());for(const p of Object.values(staff))await syncStaff({...p,chat_access:'none'},admin);await Promise.all(sessions.map(x=>x.stop()));});
 it('đồng bộ sổ đăng ký rồi mở phiên staff (C1–C2)',async()=>{
  for(const p of Object.values(staff))expect(await syncStaff(p,admin)).toEqual({ok:true});
  for(const [k,p] of Object.entries(staff)){s[k]=staffSession(p);const g=await s[k].renew();expect(g.principal.kind).toBe('staff');}
  expect(s.obs.grant!.capabilities.roles).toEqual(['observer']);
 });
 it('tài khoản chưa đăng ký không mở được phiên (403), assertion khóa lạ bị 401',async()=>{
  await expect(staffSession({...staff.nv1,id:uid(99)}).renew()).rejects.toMatchObject({status:403});
  const {privateKey}=await import('node:crypto').then(c=>c.generateKeyPairSync('ed25519'));const bad=await importSigningKey(privateKey.export({format:'pem',type:'pkcs8'}).toString());
  const res=await fetch(`${base}/sessions`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({proof:await signAssertion(assertionClaims(staff.nv1,{session_id:'x',exp:Math.floor(Date.now()/1000)+600},Math.floor(Date.now()/1000),crypto.randomUUID()),bad,'dev')})});expect(res.status).toBe(401);
 });
 it('1. khách tạo hội thoại → vào Chưa nhận của NV1, NV2 và realtime báo về',async()=>{
  const rt=new ChatRealtime(s.nv1,{onEvents:e=>events.push(...e),onSync:()=>{}});sockets.push(rt);rt.start();await until(async()=>rt.status==='live');
  await customer.renew();conversation=await customer.call<Conversation>('POST','/conversations',{kind:'support',accountRef:'TEST-ACCOUNT-A',subject:`Kiểm thử ${tag}`,clientRequestId:crypto.randomUUID()});
  await until(async()=>(await customer.call<Conversation>('GET',`/conversations/${conversation.id}`)).syncState==='ready');
  expect((await sendMessage(customer,conversation.id,{clientMessageId:crypto.randomUUID(),text:'Chào CSKH, xem https://shs.com.vn giúp mình',visibility:'public'})).kind).toMatch(/sent|accepted/);
  for(const k of ['nv1','nv2'])await until(async()=>(await listQueue(s[k],'unclaimed','TEST-ACCOUNT-A',null)).items.some(c=>c.id===conversation.id));
  await until(async()=>events.some(e=>e.conversationId===conversation.id&&e.type==='message.created'));
  const row=(await listQueue(s.nv1,'unclaimed','TEST-ACCOUNT-A',null)).items.find(c=>c.id===conversation.id)!;expect(row.customer?.displayName).toBeTruthy();expect(row.capabilities.canClaim).toBe(true);
 });
 it('2. NV1 và NV2 nhận cùng lúc → đúng một người thắng',async()=>{
  const c1=await getConversation(s.nv1,conversation.id),c2=await getConversation(s.nv2,conversation.id);
  const results=await Promise.allSettled([act(s.nv1,c1,{kind:'claim'}),act(s.nv2,c2,{kind:'claim'})]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);const lost=results.find(r=>r.status==='rejected') as PromiseRejectedResult;expect(lost.reason).toBeInstanceOf(ChatError);expect(['ALREADY_CLAIMED','REVISION_CONFLICT']).toContain(lost.reason.code);
  conversation=await getConversation(s.nv1,conversation.id);
  // Chuẩn hóa: NV1 là owner cho các bước sau.
  if(conversation.owner?.id!==s.nv1.grant!.principal.id){conversation=await act(s.nv2,await getConversation(s.nv2,conversation.id),{kind:'release'});conversation=await act(s.nv1,await getConversation(s.nv1,conversation.id),{kind:'claim'});}
  expect(conversation.owner?.displayName).toBe('NV1 Tổng hợp');
  const forNv2=await getConversation(s.nv2,conversation.id);expect(forNv2.capabilities.canReply).toBe(false);expect(forNv2.capabilities.canJoin).toBe(true);
 });
 it('3. NV2 tham gia hỗ trợ → trả lời được; CSKH thấy tên NV2, khách chỉ thấy "CSKH SHS"',async()=>{
  const joined=await act(s.nv2,await getConversation(s.nv2,conversation.id),{kind:'join'});expect(joined.participants?.map(p=>p.displayName)).toContain('NV2 Tổng hợp');expect(joined.capabilities.canReply).toBe(true);expect(joined.capabilities.canLeave).toBe(true);
  expect((await sendMessage(s.nv2,conversation.id,{clientMessageId:crypto.randomUUID(),text:'NV2 trả lời',visibility:'public'})).kind).toMatch(/sent|accepted/);
  const staffView=await until(async()=>(await listMessages(s.nv1,conversation.id,null)).items.find(m=>m.text==='NV2 trả lời'));expect(staffView.sender.displayName).toBe('NV2 Tổng hợp');
  const customerView=await until(async()=>(await customer.call<{items:Message[]}>('GET',`/conversations/${conversation.id}/messages`)).items.find(m=>m.text==='NV2 trả lời'));expect(customerView.sender.displayName).toBe('CSKH SHS');expect(customerView.sender.id).toBe('00000000-0000-0000-0000-000000000000');
 });
 it('4. ghi chú nội bộ: NV2 thấy, khách không thấy',async()=>{
  await sendMessage(s.nv1,conversation.id,{clientMessageId:crypto.randomUUID(),text:'Ghi chú nội bộ',visibility:'internal'});
  expect((await until(async()=>(await listMessages(s.nv2,conversation.id,null)).items.find(m=>m.text==='Ghi chú nội bộ'))).visibility).toBe('internal');
  expect((await customer.call<{items:Message[]}>('GET',`/conversations/${conversation.id}/messages`)).items.some(m=>m.visibility==='internal')).toBe(false);
 });
 it('5. NV1 (agent) chuyển cho NV2 → NV2 là owner, NV1 mất quyền trả lời; NV2 trả lại pool',async()=>{
  const members=await listMembers(s.nv1);expect(members.map(m=>m.displayName)).toContain('NV2 Tổng hợp');expect(members.map(m=>m.displayName)).not.toContain('Xem Tổng hợp');
  const target=members.find(m=>m.displayName==='NV2 Tổng hợp')!;
  conversation=await act(s.nv1,await getConversation(s.nv1,conversation.id),{kind:'transfer',targetPrincipalId:target.id,reason:'Đổi ca'});expect(conversation.owner?.displayName).toBe('NV2 Tổng hợp');
  expect((await getConversation(s.nv1,conversation.id)).capabilities.canReply).toBe(false);
  conversation=await act(s.nv2,await getConversation(s.nv2,conversation.id),{kind:'release'});expect(conversation.owner).toBeNull();
  expect((await listQueue(s.nv1,'unclaimed','TEST-ACCOUNT-A',null)).items.some(c=>c.id===conversation.id)).toBe(true);
 });
 it('5b. Chỉ xem: thấy pool và lịch sử (kể cả ghi chú), mọi thao tác 403',async()=>{
  expect((await listQueue(s.obs,'unclaimed','TEST-ACCOUNT-A',null)).items.some(c=>c.id===conversation.id)).toBe(true);
  expect((await listMessages(s.obs,conversation.id,null)).items.some(m=>m.visibility==='internal')).toBe(true);
  const c=await getConversation(s.obs,conversation.id);expect(Object.values(c.capabilities).every(v=>!v)).toBe(true);
  await expect(act(s.obs,c,{kind:'claim'})).rejects.toMatchObject({status:403});
  await expect(sendMessage(s.obs,conversation.id,{clientMessageId:crypto.randomUUID(),text:'không được',visibility:'public'})).rejects.toMatchObject({status:403});
 });
 it('6. đóng → Đã xong; khách không nhắn tiếp; giám sát mở lại được; Chờ khách tự về open khi khách trả lời',async()=>{
  conversation=await act(s.nv1,await getConversation(s.nv1,conversation.id),{kind:'claim'});
  conversation=await act(s.nv1,conversation,{kind:'status',status:'resolved'});expect(conversation.status).toBe('resolved');
  expect((await listQueue(s.nv1,'resolved','TEST-ACCOUNT-A',null)).items.some(c=>c.id===conversation.id)).toBe(true);
  await expect(sendMessage(customer,conversation.id,{clientMessageId:crypto.randomUUID(),text:'còn đó không',visibility:'public'})).rejects.toMatchObject({code:'CONVERSATION_RESOLVED'});
  const sup=await getConversation(s.sup,conversation.id);expect(sup.capabilities.canReopen).toBe(true);conversation=await act(s.sup,sup,{kind:'status',status:'open'});
  conversation=await act(s.nv1,await getConversation(s.nv1,conversation.id),{kind:'status',status:'pending_customer'});
  await sendMessage(customer,conversation.id,{clientMessageId:crypto.randomUUID(),text:'Mình trả lời đây',visibility:'public'});
  await until(async()=>(await getConversation(s.nv1,conversation.id)).status==='open');
 });
 it('đánh dấu đã đọc và lọc STK chính xác',async()=>{
  const last=(await listMessages(s.nv1,conversation.id,null)).items[0];expect((await markRead(s.nv1,conversation.id,last.id)).lastReadMessageId).toBe(last.id);
  expect((await listQueue(s.nv1,'mine','TEST-ACCOUNT',null)).items).toEqual([]);
  // Cursor dùng chéo bộ lọc → 422 (lý do client bỏ cursor khi đổi tab).
  await expect(s.nv1.call('GET','/queues/support-default/conversations?status=open&cursor=bogus')).rejects.toMatchObject({status:422});
 });
 it('7. hạ NV2 về none → phiên và socket bị cắt ngay',async()=>{
  let closed=false;const rt=new ChatRealtime(s.nv2,{onEvents:()=>{},onSync:()=>{},onForbidden:()=>{closed=true;},onStatus:st=>{if(st!=='live'&&st!=='connecting')closed=true;}});sockets.push(rt);rt.start();await until(async()=>rt.status==='live');
  expect(await syncStaff({...staff.nv2,chat_access:'none'},admin)).toEqual({ok:true});
  await until(async()=>closed,5000);
  await expect(s.nv2.call('GET','/queues/support-default/conversations')).rejects.toBeInstanceOf(ChatError);
 });
});
