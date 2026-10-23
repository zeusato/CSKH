// Kiểm thử giao diện Chat với Chat Gateway local thật (Chat-server `npm run dev:local`). Mọi request Supabase được giả lập
// trong browser context cô lập; Edge Function chat-session được thay bằng hàm ký assertion bằng khóa local. Chỉ persona tổng hợp.
// Biến môi trường: CHAT_IT_GATEWAY, CHAT_IT_SERVER_DIR, CHAT_IT_KEY_FILE, CHAT_IT_ADMIN_KEY_FILE, PLAYWRIGHT_MODULE, CARE_BROWSER_PATH, CARE_UI_URL.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createPrivateKey,randomUUID,sign} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const gateway=process.env.CHAT_IT_GATEWAY||'http://127.0.0.1:8080',api=`${gateway}/v1/chat`,base=process.env.CARE_UI_URL||'http://127.0.0.1:5173';
const key=createPrivateKey(await fs.readFile(process.env.CHAT_IT_KEY_FILE,'utf8')),adminKey=(await fs.readFile(process.env.CHAT_IT_ADMIN_KEY_FILE,'utf8')).trim();
const tag=Date.now().toString(36).slice(-8).padStart(8,'0'),uid=n=>`00000000-0000-4000-9000-${tag}${String(n).padStart(4,'0')}`,account=`TEST-ACCOUNT-A`;
const people={nv1:{id:uid(1),name:'Lan Tổng Hợp',role:'user',chat_access:'agent'},nv2:{id:uid(2),name:'Minh Tổng Hợp',role:'user',chat_access:'agent'},obs:{id:uid(3),name:'Xem Tổng Hợp',role:'viewer',chat_access:'read'}};
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const assertion=p=>{const now=Math.floor(Date.now()/1000),data=`${b64({alg:'EdDSA',typ:'JWT',kid:'dev'})}.${b64({iss:'cskh-desk',aud:'chat-gateway',sub:p.id,kind:'staff',name:p.name,sid:`sid-${p.id}`,sid_exp:now+3600,jti:randomUUID(),iat:now,exp:now+60})}`;return `${data}.${sign(null,Buffer.from(data),key).toString('base64url')}`;};
const register=(p,method='PUT')=>fetch(`${api}/admin/staff/cskh-desk/${p.id}`,{method,headers:{authorization:`Bearer ${adminKey}`,'content-type':'application/json'},body:method==='PUT'?JSON.stringify({displayName:p.name,roles:[p.chat_access==='read'?'observer':p.chat_access],queueIds:['support-default']}):undefined});
async function customerCall(token,method,path,body){const r=await fetch(`${api}${path}`,{method,headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`${method} ${path} ${r.status} ${await r.text()}`);return r.status===204?null:r.json();}
const browser=await chromium.launch({headless:true,...(process.env.CARE_BROWSER_PATH?{executablePath:process.env.CARE_BROWSER_PATH}:{})});
const errors=[],unexpected=[],checks=[],sessionCalls={};
async function open(name,viewport={width:1440,height:960}){
 const p=people[name],profile={...p,active:true,department_id:null,created_at:'2026-10-23T02:00:00Z'};
 const user={id:p.id,email:`${name}@example.test`,aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:profile.created_at};
 const token=[{alg:'HS256',typ:'JWT'},{sub:p.id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:`sid-${p.id}`},'fixture'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
 const context=await browser.newContext({viewport});const page=await context.newPage();page.on('pageerror',e=>errors.push(`${name}: ${e.message}`));
 const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
 await context.route('**/*.supabase.co/**',async route=>{const path=new URL(route.request().url()).pathname;
  if(path.includes('/auth/v1/token'))return reply(route,{access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user});if(path.includes('/auth/v1/user'))return reply(route,user);if(path.includes('/auth/v1/logout'))return reply(route,{});
  if(path.endsWith('/app_users'))return reply(route,profile);
  // Thay Edge Function chat-session: chỉ ký cho persona đang đăng nhập.
  if(path.endsWith('/functions/v1/chat-session')){sessionCalls[name]=(sessionCalls[name]||0)+1;return reply(route,{assertion:assertion(p),gatewayUrl:api});}
  unexpected.push(`${name}: ${path}`);return reply(route,{message:'Unexpected test endpoint'},400);});
 await page.goto(`${base}/chat`);await page.getByLabel('Email công việc').fill(user.email);await page.getByPlaceholder('Nhập mật khẩu của bạn').fill('Fixture123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.getByRole('heading',{name:/Chat khách hàng/}).waitFor();return {page,context};
}
await fs.mkdir('.local/chat-qa',{recursive:true});let nv1,nv2,obs;
try{
 for(const p of Object.values(people))assert.equal((await register(p)).status,200);
 // Khách giả tạo hội thoại bằng proof fixture của Gateway local.
 const proof=execFileSync(process.execPath,['--experimental-strip-types','--no-warnings=ExperimentalWarning','scripts/dev-proof.ts','customerA'],{cwd:process.env.CHAT_IT_SERVER_DIR,encoding:'utf8'}).trim();
 const customer=(await customerCall(null,'POST','/sessions',{proof})).accessToken;
 const conv=await customerCall(customer,'POST','/conversations',{kind:'support',accountRef:account,subject:`Hỏi về lệnh ${tag}`,clientRequestId:randomUUID()});
 for(let i=0;i<40&&(await customerCall(customer,'GET',`/conversations/${conv.id}`)).syncState!=='ready';i++)await new Promise(r=>setTimeout(r,200));
 const hostile='Xem https://shs.com.vn/huong-dan, <script>alert(1)</script> <img src=x onerror=alert(2)> javascript:alert(3)';
 await customerCall(customer,'POST',`/conversations/${conv.id}/messages`,{clientMessageId:randomUUID(),text:hostile});
 nv1=await open('nv1');const p1=nv1.page;
 await p1.locator('.nav-link .nav-badge').waitFor();checks.push('menu badge shows unread count');
 await p1.getByRole('tab',{name:/Chưa nhận/}).click();await p1.getByLabel('Tìm theo STK').fill(account);await p1.getByLabel('Tìm theo STK').press('Enter');
 const row=p1.locator('.chat-row',{hasText:`Hỏi về lệnh ${tag}`});await row.waitFor();assert.match(await row.innerText(),/Chưa có người nhận/);checks.push('pool shows unclaimed conversation with care badge and STK filter');
 await row.click();const bubble=p1.locator('.chat-message.from-customer .chat-text').first();await bubble.waitFor();
 assert.equal(await bubble.innerText(),hostile);assert.equal(await bubble.locator('a').count(),1);assert.equal(await bubble.locator('a').getAttribute('href'),'https://shs.com.vn/huong-dan');assert.equal(await bubble.locator('a').getAttribute('rel'),'noopener noreferrer');assert.equal(await p1.locator('.chat-messages img, .chat-messages script').count(),0);checks.push('message renders as plain text, only http(s) links, no HTML executed');
 assert.equal(await p1.getByRole('textbox',{name:'Trả lời khách'}).isDisabled(),true);await p1.getByText('Nhận xử lý hoặc Tham gia hỗ trợ để trả lời khách.').waitFor();
 await p1.getByRole('button',{name:'Nhận xử lý'}).click();await p1.locator('.chat-banner',{hasText:'Bạn đang chăm sóc'}).waitFor();checks.push('claim switches banner to "Bạn đang chăm sóc"');
 nv2=await open('nv2');const p2=nv2.page;await p2.goto(`${base}/chat/${conv.id}`);
 await p2.locator('.chat-banner',{hasText:'Lan Tổng Hợp đang chăm sóc khách này'}).waitFor();assert.equal(await p2.getByRole('textbox',{name:'Trả lời khách'}).isDisabled(),true);
 await p2.getByRole('button',{name:'Tham gia hỗ trợ'}).click();await p2.locator('.chat-banner',{hasText:'Bạn đang hỗ trợ Lan Tổng Hợp'}).waitFor();checks.push('colleague sees who is caring and can join');
 await p2.getByRole('textbox',{name:'Trả lời khách'}).fill('Chào anh, Minh hỗ trợ thêm ạ');await p2.getByRole('textbox',{name:'Trả lời khách'}).press('Enter');
 await p1.locator('.chat-message',{hasText:'Chào anh, Minh hỗ trợ thêm ạ'}).locator('.chat-meta',{hasText:'Minh Tổng Hợp'}).waitFor({timeout:8000});checks.push('reply from helper appears for owner in realtime with real staff name');
 const cust=await customerCall(customer,'GET',`/conversations/${conv.id}/messages`);assert.equal(cust.items.find(m=>m.text==='Chào anh, Minh hỗ trợ thêm ạ').sender.displayName,'CSKH SHS');checks.push('customer sees "CSKH SHS" only');
 await p1.getByRole('radio',{name:'Ghi chú nội bộ'}).click();await p1.getByRole('textbox',{name:'Ghi chú nội bộ'}).fill('Khách VIP, ưu tiên');await p1.getByRole('button',{name:'Lưu ghi chú'}).click();
 await p2.locator('.chat-message.is-internal',{hasText:'Khách VIP, ưu tiên'}).getByText('Ghi chú nội bộ — khách không thấy').waitFor({timeout:8000});assert.ok(!(await customerCall(customer,'GET',`/conversations/${conv.id}/messages`)).items.some(m=>m.visibility==='internal'));checks.push('internal note visible to colleague, hidden from customer');
 await p1.screenshot({path:'.local/chat-qa/desktop-owner.png'});
 // Draft giữ nguyên khi resize desktop → phone, đúng hội thoại; không cuộn ngang.
 await p1.getByRole('radio',{name:'Trả lời khách'}).click();await p1.getByRole('textbox',{name:'Trả lời khách'}).fill('Nháp đang soạn dở');
 await p1.setViewportSize({width:390,height:844});await p1.getByRole('button',{name:'Quay lại danh sách'}).waitFor();assert.equal(await p1.getByRole('textbox',{name:'Trả lời khách'}).inputValue(),'Nháp đang soạn dở');assert.ok(await p1.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p1.screenshot({path:'.local/chat-qa/phone-thread.png'});
 await p1.getByRole('button',{name:'Quay lại danh sách'}).click();await p1.getByRole('tab',{name:/Của tôi/}).click();await row.waitFor();assert.match(await row.innerText(),/Bạn đang chăm sóc/);assert.ok(await p1.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p1.screenshot({path:'.local/chat-qa/phone-pool.png'});await row.click();assert.equal(await p1.getByRole('textbox',{name:'Trả lời khách'}).inputValue(),'Nháp đang soạn dở');
 await p1.setViewportSize({width:1440,height:960});checks.push('draft survives resize and phone back navigation; no horizontal scroll');
 await p1.getByRole('button',{name:'Chuyển cho đồng nghiệp'}).click();const dialog=p1.getByRole('dialog',{name:'Chuyển cho đồng nghiệp'});await dialog.getByText('Minh Tổng Hợp').click();await dialog.getByLabel('Lý do chuyển').fill('Đổi ca');await dialog.getByRole('button',{name:'Chuyển hội thoại'}).click();
 await p1.locator('.chat-banner',{hasText:'Minh Tổng Hợp đang chăm sóc khách này'}).waitFor();await p2.locator('.chat-banner',{hasText:'Bạn đang chăm sóc'}).waitFor({timeout:8000});assert.equal(await p1.getByRole('textbox',{name:'Trả lời khách'}).isDisabled(),true);checks.push('agent transfers to colleague; previous owner loses reply');
 obs=await open('obs');const p3=obs.page;assert.equal(await p3.getByRole('tab',{name:'Của tôi'}).count(),0);await p3.goto(`${base}/chat/${conv.id}`);await p3.locator('.chat-banner',{hasText:'Bạn đang xem ở chế độ chỉ đọc'}).waitFor();
 assert.equal(await p3.locator('.chat-composer').count(),0);assert.equal(await p3.locator('.chat-banner-actions').count(),0);await p3.locator('.chat-message.is-internal').first().waitFor();checks.push('read-only: no composer, no actions, history incl. notes visible');
 await p3.screenshot({path:'.local/chat-qa/readonly.png'});
 // Hạ quyền NV2 → Gateway cắt phiên và socket; trang báo mất quyền.
 assert.equal((await register(people.nv2,'DELETE')).status,204);await p2.getByText('Bạn chưa được cấp quyền Chat hoặc quyền vừa bị thu hồi').waitFor({timeout:15000});checks.push('revoking access cuts the open chat page');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
 const summary={passed:true,checks,sessionCalls,customerWrites:'synthetic only',checkedAt:new Date().toISOString()};await fs.writeFile('docs/validation/chat-ui.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}catch(e){for(const [n,x] of Object.entries({nv1,nv2,obs}))await x?.page.screenshot({path:`.local/chat-qa/failure-${n}.png`,fullPage:true}).catch(()=>{});console.error(JSON.stringify({error:e.message,errors,unexpected,checks}));process.exitCode=1;}
finally{for(const p of Object.values(people))await register(p,'DELETE').catch(()=>{});await browser.close();}
