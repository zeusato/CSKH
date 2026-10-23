// Deterministic latency/race regression checks. Auth, HTTP and WS are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const base=process.env.CARE_UI_URL||'http://127.0.0.1:5173';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const until=async(fn)=>{const end=Date.now()+8000;while(!fn()){assert.ok(Date.now()<end,'Timed out waiting for synthetic request');await new Promise(r=>setTimeout(r,20));}};
const id='00000000-0000-4000-9000-000000000002';
const profile={id,name:'Kiểm thử độ trễ',role:'admin',active:true,chat_access:'supervisor',created_at:'2026-10-23T00:00:00Z'};
const user={id,email:'latency@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:profile.created_at};
const token=[{alg:'HS256'},{sub:id,exp:Math.floor(Date.now()/1000)+3600,session_id:'latency'},'fixture'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
const conversation={id:'latency-conversation',kind:'support',accountRef:'TEST-LATENCY',subject:'Kiểm thử độ trễ',status:'open',owner:{id,displayName:profile.name},revision:1,unreadCount:0,updatedAt:profile.created_at,syncState:'ready',needsReview:false,customer:{id:'customer',displayName:'Khách tổng hợp'},participants:[],capabilities:Object.fromEntries(['canReply','canTransfer','canAddNote','canResolve','canRelease','canManageParticipants'].map(k=>[k,true]))};
let sequence=0;
const makeMessage=(text)=>({id:`m${++sequence}`,conversationId:conversation.id,clientMessageId:null,sender:{id:'customer',kind:'customer',displayName:'Khách tổng hợp'},visibility:'public',text:text||`Tin tổng hợp ${sequence}`,createdAt:new Date(Date.UTC(2026,9,23,10,0,sequence)).toISOString(),status:'accepted',attachments:[]});
const messages=Array.from({length:80},()=>makeMessage());
const browser=await chromium.launch({headless:true,...(process.env.CARE_BROWSER_PATH?{executablePath:process.env.CARE_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1366,height:768}}),page=await context.newPage();
const errors=[],requests=[],checks=[],measurements={};
const detailGate=deferred();let socket,authSeen=false,readySent=false,headGate=null,olderGate=null,failHead=false,postAt;
page.on('pageerror',e=>errors.push(e.message));
const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
await context.route('**/*.supabase.co/**',route=>{
 const path=new URL(route.request().url()).pathname;
 if(path.includes('/auth/v1/token'))return reply(route,{access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user});
 if(path.includes('/auth/v1/user'))return reply(route,user);
 if(path.endsWith('/app_users'))return reply(route,profile);
 if(path.endsWith('/feature_flags'))return reply(route,[{key:'chat_module',enabled:true}]);
 if(path.endsWith('/functions/v1/chat-session'))return reply(route,{assertion:'fixture',gatewayUrl:'https://chat-latency.test/v1/chat'});
 return reply(route,[]);
});
await context.route('https://chat-latency.test/**',async route=>{
 const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();
 if(path.endsWith('/sessions'))return reply(route,{accessToken:'fixture',expiresAt:new Date(Date.now()+300000).toISOString(),principal:{id,kind:'staff',displayName:profile.name},capabilities:{roles:['supervisor'],queueIds:['support-default'],accountRefs:[]}});
 if(path.endsWith('/realtime-tickets'))return reply(route,{ticket:'fixture'});
 if(path.includes('/queues/'))return reply(route,{items:[conversation],nextCursor:null});
 if(path.endsWith('/messages')){
  if(method==='POST'){
   const input=route.request().postDataJSON(),message={...makeMessage(input.text),...input,sender:{id,kind:'agent',displayName:profile.name}};messages.push(message);postAt=performance.now();return reply(route,message,201);
  }
  const cursor=url.searchParams.get('cursor'),limit=Number(url.searchParams.get('limit'));
  requests.push({cursor,limit,at:performance.now(),readySent});
  const newest=[...messages].reverse(),start=cursor?newest.findIndex(m=>m.id===cursor)+1:0,items=newest.slice(start,start+limit);
  const snapshot={items,nextCursor:start+limit<newest.length?items.at(-1).id:null};
  if(!cursor&&headGate)await headGate.promise;
  if(cursor&&olderGate)await olderGate.promise;
  if(!cursor&&failHead)return reply(route,{code:'DEPENDENCY_FAILED',retryable:true},503);
  return reply(route,snapshot);
 }
 if(path.endsWith('/read'))return reply(route,{lastReadMessageId:route.request().postDataJSON().lastReadMessageId});
 if(path.endsWith(`/conversations/${conversation.id}`))await detailGate.promise;
 return reply(route,conversation);
});
await context.routeWebSocket('wss://chat-latency.test/**',ws=>{socket=ws;ws.onMessage(()=>{authSeen=true;});});
let event=0;
const emit=()=>socket.send(JSON.stringify({type:'events',cursor:`event-${++event}`,events:[{eventId:`event-${event}`,type:'message.created',conversationId:conversation.id,occurredAt:new Date().toISOString(),revision:null,cursor:String(event),payload:{}}]}));
const bubble=text=>page.locator('.chat-message .chat-text').filter({hasText:text});
const headRequests=()=>requests.filter(r=>!r.cursor).length;
const olderRequests=()=>requests.filter(r=>r.cursor).length;
try{
 await page.goto(`${base}/chat/${conversation.id}`);
 await page.getByLabel('Email công việc').fill(user.email);await page.getByPlaceholder('Nhập mật khẩu của bạn').fill('Fixture123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 // Metadata is intentionally blocked and WS ready is withheld. History must
 // already be fetching, proving both waterfall dependencies have been removed.
 await until(()=>headRequests()>0&&authSeen);assert.equal(requests[0].readySent,false);assert.equal(requests[0].limit,19);
 detailGate.resolve();await bubble('Tin tổng hợp 80').waitFor();
 checks.push('history loads before WS ready and in parallel with conversation metadata');
 messages.push(makeMessage('Tin trong khoảng trước ready'));readySent=true;socket.send(JSON.stringify({type:'ready',cursor:'ready'}));
 await bubble('Tin trong khoảng trước ready').waitFor();checks.push('ready reconciles the initial HTTP/socket gap');

 // Burst during a deliberately slow head response: first snapshot is stale.
 headGate=deferred();let before=headRequests();messages.push(makeMessage('Tin khi bắt đầu tải'));emit();await until(()=>headRequests()>before);
 messages.push(makeMessage('Tin đến giữa lúc tải'));for(let i=0;i<10;i++)emit();
 const gate=headGate;headGate=null;gate.resolve();await bubble('Tin đến giữa lúc tải').waitFor();
 assert.equal(headRequests()-before,2);checks.push('events during an in-flight snapshot coalesce into one trailing refresh without losing messages');

 // Loading older history must not delay the newest page, and a new event must
 // not re-fetch any old pages. Keep the older response blocked as proof.
 olderGate=deferred();const oldBefore=olderRequests();
 await page.getByRole('button',{name:'Tải tin cũ hơn',exact:true}).click();await until(()=>olderRequests()>oldBefore);
 const currentOld=olderRequests();const incomingAt=performance.now();messages.push(makeMessage('Tin mới khi đang tải lịch sử'));emit();
 await bubble('Tin mới khi đang tải lịch sử').waitFor({state:'attached'});measurements.incomingWithHistoryBlockedMs=Math.round(performance.now()-incomingAt);
 assert.equal(olderRequests(),currentOld);
 const oldGate=olderGate;olderGate=null;oldGate.resolve();await bubble('Tin tổng hợp 12').waitFor({state:'attached'});
 assert.equal(await bubble('Tin mới khi đang tải lịch sử').count(),1);checks.push('newest messages display while older history is blocked; loaded pages are retained and not refetched');

 // Block every history response after POST. A confirmed message must still
 // appear from the POST DTO rather than waiting for a second round trip.
 await page.locator('.chat-messages').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 headGate=deferred();const input=page.getByRole('textbox',{name:'Trả lời khách'});
 await input.fill('Tin gửi xác nhận tức thì');await input.press('Enter');await bubble('Tin gửi xác nhận tức thì').waitFor();
 measurements.confirmedPostToBubbleMs=Math.round(performance.now()-postAt);assert.equal(await bubble('Tin gửi xác nhận tức thì').count(),1);
 const sendGate=headGate;headGate=null;sendGate.resolve();emit();await until(()=>headRequests()>before+2);
 assert.equal(await bubble('Tin gửi xác nhận tức thì').count(),1);checks.push('201 response renders without a history read; realtime echo does not duplicate it');

 // A transient background refresh failure must not blank the existing history.
 failHead=true;emit();await page.getByText('Chưa cập nhật được tin mới.',{exact:false}).waitFor();
 assert.equal(await bubble('Tin gửi xác nhận tức thì').count(),1);failHead=false;await page.getByRole('button',{name:'Thử lại',exact:true}).click();
 await page.getByText('Chưa cập nhật được tin mới.',{exact:false}).waitFor({state:'detached'});checks.push('background refresh failure preserves messages and can be retried');
 assert.deepEqual(errors,[]);
 await fs.mkdir('.local/chat-latency-qa',{recursive:true});await page.screenshot({path:'.local/chat-latency-qa/verified.png'});
 const report={passed:true,checks,measurements,backend:'fully mocked; timings demonstrate client behavior only, not production latency',checkedAt:new Date().toISOString()};
 await fs.writeFile('docs/validation/chat-latency.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(e){console.error({error:e.message,checks,errors,headRequests:headRequests(),olderRequests:olderRequests()});throw e;}
finally{detailGate.resolve();headGate?.resolve();olderGate?.resolve();await browser.close();}
