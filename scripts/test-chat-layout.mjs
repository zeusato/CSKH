// Isolated layout checks: all Auth, Gateway HTTP and WebSocket traffic is synthetic.
// Requires local Vite + Playwright; same PLAYWRIGHT_MODULE/CARE_BROWSER_PATH as other UI checks.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.CARE_UI_URL||'http://127.0.0.1:5173';
const id='00000000-0000-4000-9000-000000000001';
const profile={id,name:'Nhân viên kiểm thử',role:'admin',active:true,chat_access:'supervisor',created_at:'2026-10-23T00:00:00Z'};
const user={id,email:'layout@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:profile.created_at};
const token=[{alg:'HS256'},{sub:id,exp:Math.floor(Date.now()/1000)+3600,session_id:'layout'},'fixture'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
const conversation={id:'layout-conversation',kind:'support',accountRef:'TEST-000123',subject:'Hỗ trợ khách hàng',status:'open',owner:{id,displayName:profile.name},revision:1,unreadCount:0,updatedAt:profile.created_at,syncState:'ready',needsReview:false,customer:{id:'customer',displayName:'Khách hàng kiểm thử'},participants:[],capabilities:Object.fromEntries(['canReply','canTransfer','canAddNote','canResolve','canRelease','canManageParticipants'].map(k=>[k,true]))};
const messages=Array.from({length:40},(_,i)=>({id:`message-${i}`,conversationId:conversation.id,clientMessageId:null,sender:{id:i%2?id:'customer',kind:i%2?'agent':'customer',displayName:i%2?profile.name:'Khách hàng kiểm thử'},visibility:'public',text:i%2?'Em đã tiếp nhận thông tin. Anh/chị kiểm tra lại giúp em nhé.':'Tôi cần hỗ trợ kiểm tra thông tin tài khoản và hướng dẫn thao tác.',createdAt:new Date(Date.UTC(2026,9,23,8,i)).toISOString(),status:'delivered',attachments:[]}));
const browser=await chromium.launch({headless:true,...(process.env.CARE_BROWSER_PATH?{executablePath:process.env.CARE_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1684,height:852}}),page=await context.newPage();
const errors=[],checks=[],measurements=[];
page.on('pageerror',e=>errors.push(e.message));
const reply=(route,data)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
await context.route('**/*.supabase.co/**',route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.includes('/auth/v1/token'))return reply(route,{access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user});
 if(path.includes('/auth/v1/user'))return reply(route,user);
 if(path.endsWith('/app_users'))return reply(route,profile);
 if(path.endsWith('/feature_flags'))return reply(route,[{key:'chat_module',enabled:true}]);
 if(path.endsWith('/functions/v1/chat-session'))return reply(route,{assertion:'fixture',gatewayUrl:'https://chat-layout.test/v1/chat'});
 if(path.endsWith('/search_tickets'))return reply(route,{items:[],hasMore:false,nextCursor:null});
 if(path.endsWith('/ticket_counts'))return reply(route,{all:0});
 return reply(route,[]);
});
await context.route('https://chat-layout.test/**',route=>{
 const path=new URL(route.request().url()).pathname,method=route.request().method();
 if(path.endsWith('/sessions'))return reply(route,{accessToken:'fixture',expiresAt:new Date(Date.now()+300000).toISOString(),principal:{id,kind:'staff',displayName:profile.name},capabilities:{roles:['supervisor'],queueIds:['support-default'],accountRefs:[]}});
 if(path.endsWith('/realtime-tickets'))return reply(route,{ticket:'fixture'});
 if(path.includes('/queues/'))return reply(route,{items:Array.from({length:24},(_,i)=>({...conversation,id:i?`other-${i}`:conversation.id,customer:{id:`customer-${i}`,displayName:`Khách hàng kiểm thử ${i+1}`}})),nextCursor:null});
 if(path.endsWith('/messages')){
  if(method==='POST'){const input=route.request().postDataJSON(),message={...messages[1],...input,id:'sent-fixture',createdAt:new Date().toISOString()};messages.push(message);return reply(route,message);}
  return reply(route,{items:[...messages].reverse(),nextCursor:null});
 }
 if(path.endsWith('/read'))return reply(route,{lastReadMessageId:messages.at(-1).id});
 return reply(route,conversation);
});
await context.routeWebSocket('wss://chat-layout.test/**',ws=>ws.onMessage(()=>ws.send(JSON.stringify({type:'ready',cursor:'fixture'}))));
await fs.mkdir('.local/chat-layout-qa',{recursive:true});
async function measure(label){
 const value=await page.evaluate(()=>{
  const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  return {width:innerWidth,height:innerHeight,bodyWidth:document.documentElement.scrollWidth,bodyHeight:document.documentElement.scrollHeight,layout:rect('.chat-layout'),history:rect('.chat-messages'),composer:rect('.chat-composer'),input:rect('.chat-composer textarea')};
 });
 assert.ok(value.bodyWidth<=value.width,`${label}: horizontal page overflow`);
 assert.ok(value.bodyHeight<=value.height+1,`${label}: vertical page overflow`);
 assert.ok(Math.abs(value.layout.bottom-value.height)<2,`${label}: workspace must reach the bottom`);
 assert.ok(value.composer.bottom<=value.height+1,`${label}: composer clipped`);
 assert.ok(value.history.height>=Math.min(200,value.height*.25),`${label}: insufficient message space`);
 measurements.push({label,...value});return value;
}
try{
 await page.goto(`${base}/chat/${conversation.id}`);
 await page.getByLabel('Email công việc').fill(user.email);await page.getByPlaceholder('Nhập mật khẩu của bạn').fill('Fixture123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.locator('.chat-message').first().waitFor();
 const input=page.getByRole('textbox',{name:'Trả lời khách'});
 const desktop=await measure('desktop-1684x852');assert.ok(desktop.history.height>450);
 await page.screenshot({path:'.local/chat-layout-qa/desktop.png'});
 await page.getByRole('button',{name:'Ẩn danh sách hội thoại'}).click();const wide=await measure('collapsed-pool');assert.ok(wide.history.width>desktop.history.width+250);
 await page.getByRole('button',{name:'Hiện danh sách hội thoại'}).click();
 await page.locator('.chat-action-menu summary').click();await page.getByRole('button',{name:'Trả lại pool'}).waitFor();await page.keyboard.press('Escape');assert.equal(await page.locator('.chat-action-menu').getAttribute('open'),null);
 checks.push('full-height workspace, collapsible queue, secondary actions accessible by keyboard');
 await input.fill(Array.from({length:18},(_,i)=>`Dòng nháp ${i+1}`).join('\n'));
 const expanded=await measure('long-draft');assert.ok(expanded.input.height>desktop.input.height);assert.ok(expanded.input.height<=161);
 await page.waitForFunction(()=>{const el=document.querySelector('.chat-messages');return el.scrollHeight-el.scrollTop-el.clientHeight<5;});
 await input.fill('Tin kiểm thử bố cục');await input.press('Enter');await page.getByText('Tin kiểm thử bố cục',{exact:true}).waitFor();assert.equal(await input.inputValue(),'');
 checks.push('composer expands with text, stays bounded, sends by Enter and shrinks after sending');
 for(const [width,height] of [[1366,768],[1024,600],[768,1024],[390,844],[390,560],[320,568]]){
  await page.setViewportSize({width,height});await input.fill('Nháp vẫn giữ nguyên');await measure(`${width}x${height}`);
  if(width===390&&height===844)await page.screenshot({path:'.local/chat-layout-qa/phone.png'});
 }
 await page.getByRole('button',{name:'Quay lại danh sách'}).click();await page.locator('.chat-row').first().click();assert.equal(await input.inputValue(),'Nháp vẫn giữ nguyên');
 checks.push('desktop, tablet, phone and reduced-height viewport: no page overflow, visible composer, draft retained');
 await page.setViewportSize({width:1366,height:768});
 await page.getByRole('button',{name:'Chuyển giao diện tối'}).click();
 // Wait for existing color transitions and the alternate logo before visual QA.
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.chat-row')).color===getComputedStyle(document.documentElement).color);
 await page.locator('.brand img').evaluate(img=>img.decode());await page.screenshot({path:'.local/chat-layout-qa/dark.png'});
 await page.getByRole('link',{name:'Quản lý ticket',exact:true}).click();await page.getByRole('heading',{name:/Quản lý ticket/}).waitFor();assert.equal(await page.locator('.app-shell--chat').count(),0);assert.equal(await page.locator('.app-footer').isVisible(),true);
 checks.push('dark theme works; leaving Chat restores the ordinary page layout');
 assert.deepEqual(errors,[]);
 const report={passed:true,checks,measurements,backend:'mocked; no production requests',checkedAt:new Date().toISOString()};
 await fs.writeFile('docs/validation/chat-layout.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}catch(error){console.error({message:error.message,errors});await page.screenshot({path:'.local/chat-layout-qa/failure.png'}).catch(()=>{});throw error;}
finally{await browser.close();}
