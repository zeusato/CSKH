// Headless UI smoke tests with intercepted Supabase traffic; no production writes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE?pathToFileURL(process.env.PLAYWRIGHT_MODULE).href:'playwright');
const browser=await chromium.launch({headless:true,...(process.env.CARE_BROWSER_PATH?{executablePath:process.env.CARE_BROWSER_PATH}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage();
const errors=[],unexpected=[];page.on('pageerror',e=>errors.push(e.message));
const id='00000000-0000-0000-0000-000000000001',ticketId='00000000-0000-0000-0000-000000000010',logId='00000000-0000-0000-0000-000000000020';
let profile={id,name:'Kiểm thử thư viện',active:true,role:'admin',care_log_access:'write',created_at:'2026-10-23T02:00:00Z'};
let ticket={id:ticketId,code:'CSKH-000001',title:'Vấn đề ticket',description:'Mô tả ticket',resolution:'Lời giải ticket',status:'in_progress',version:1,origin:null,received_at:profile.created_at,created_at:profile.created_at,updated_at:profile.created_at,completed_at:null};
let log={id:logId,code:'NK-000001',description:'Vấn đề nhật ký',response_content:'Phản hồi nhật ký',notes:'',account_user:'',request_type:'support',status:'received',received_at:profile.created_at,created_at:profile.created_at,updated_at:profile.created_at,completed_at:null,version:1};
const entries=[],images=[{id:'image-1',ticket_id:ticketId,name:'huong-dan.png',mime_type:'image/png',path:'fixture/immutable-image',size:68,state:'ready',created_at:profile.created_at}];
let libraryImages=[],saveCalls=0;
const user={id,email:'library@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:profile.created_at};
const token=[{alg:'HS256',typ:'JWT'},{sub:id,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'},'fixture'].map(x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url')).join('.');
const session={access_token:token,refresh_token:'fixture',expires_in:3600,token_type:'bearer',user};
const reply=(route,data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
await page.route('**/*.supabase.co/**',async route=>{
 const request=route.request(),url=new URL(request.url()),path=url.pathname;let body;try{body=request.postDataJSON();}catch{}
 if(path.includes('/auth/v1/token'))return reply(route,session);
 if(path.includes('/auth/v1/user'))return reply(route,user);
 if(path.includes('/auth/v1/logout'))return reply(route,{});
 if(path.includes('/storage/v1/object/sign/')&&request.method()==='POST')return reply(route,{signedURL:'/object/sign/ticket-images/fixture.png?token=fixture'});
 if(path.includes('/storage/v1/object/'))return route.fulfill({contentType:'image/png',body:await fs.readFile('public/LOGO Light.png')});
 if(path.endsWith('/rpc/search_tickets'))return reply(route,{items:ticket?[{...ticket,description_excerpt:ticket.description,resolution_excerpt:ticket.resolution}]:[],hasMore:false,nextCursor:null});
 if(path.endsWith('/rpc/ticket_counts'))return reply(route,{all:ticket?1:0,resolved:ticket?.status==='resolved'?1:0});
 if(path.endsWith('/tickets')){if(request.method()==='DELETE'){ticket=null;return reply(route,[{id:ticketId}]);}return reply(route,ticket);}
 if(path.endsWith('/ticket_attachments'))return reply(route,ticket?images:[]);
 if(path.endsWith('/rpc/search_care_logs'))return reply(route,{items:log?[log]:[],hasMore:false,nextCursor:null});
 if(path.endsWith('/rpc/care_log_counts'))return reply(route,{all:log?1:0,received:log?1:0});
 if(path.endsWith('/rpc/care_log_import_batches'))return reply(route,[]);
 if(path.endsWith('/care_logs'))return reply(route,log);
 if(path.endsWith('/rpc/save_to_library')){
  saveCalls++;let e=entries.find(x=>x.source_type===body.p_source_type&&x.source_id===body.p_source_id);
  if(!e){const src=body.p_source_type==='ticket'?ticket:log;e={id:`entry-${entries.length+1}`,code:`TV-00000${entries.length+1}`,title:body.p_title,description:body.p_description,resolution:body.p_resolution,source_type:body.p_source_type,source_id:src.id,source_code:src.code,source_version:src.version,source_received_at:src.received_at,source_completed_at:src.completed_at,source_context:{},system_name:'SH Smart App',category_name:'Hỗ trợ',created_at:profile.created_at,updated_at:profile.created_at,version:1};entries.push(e);if(e.source_type==='ticket')libraryImages=images.map(a=>({...a,entry_id:e.id}));}
  return reply(route,e.id);
 }
 if(path.endsWith('/rpc/search_library'))return reply(route,{items:entries.filter(x=>!body.p_filters.source_type||x.source_type===body.p_filters.source_type),total:entries.length,hasMore:false,nextCursor:null});
 if(path.endsWith('/library_entries')){
  const e=entries.find(x=>url.searchParams.get('id')==='eq.'+x.id||url.searchParams.get('source_id')==='eq.'+x.source_id);
  if(request.method()==='PATCH'){assert.deepEqual(Object.keys(body).sort(),['description','resolution','title']);Object.assign(e,body,{version:e.version+1});return reply(route,{id:e.id});}
  if(request.method()==='DELETE'){entries.splice(entries.indexOf(e),1);return reply(route,{id:e.id});}
  return reply(route,e||null);
 }
 if(path.endsWith('/library_attachments'))return reply(route,libraryImages.filter(x=>url.searchParams.get('entry_id')==='eq.'+x.entry_id));
 if(path.endsWith('/app_users'))return reply(route,url.searchParams.has('id')?profile:[profile]);
 if(['departments','staff','systems','categories'].some(x=>path.endsWith('/'+x)))return reply(route,[]);
 if(path.endsWith('/functions/v1/storage-cleanup'))return reply(route,{removed:0,failed:0});
 unexpected.push(path);return reply(route,{message:'Unexpected endpoint'},400);
});
const base=process.env.CARE_UI_URL||'http://127.0.0.1:5173';
await fs.mkdir('.local/library-qa',{recursive:true});
try{
 await page.goto(`${base}/tickets?ticket=${ticketId}`);await page.getByLabel('Email công việc').fill(user.email);await page.getByPlaceholder('Nhập mật khẩu của bạn').fill('Fixture123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.getByRole('heading',{name:'CSKH-000001',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Lưu vào thư viện',exact:true}).count(),0);
 ticket.status='resolved';ticket.version++;ticket.completed_at=profile.created_at;await page.reload();await page.getByRole('button',{name:'Lưu vào thư viện',exact:true}).click();
 const form=page.getByRole('dialog',{name:'Lưu vào thư viện',exact:true});await form.getByLabel('Tiêu đề').fill('Lời giải được biên tập');await form.getByRole('button',{name:'Lưu vào thư viện',exact:true}).click();await page.getByRole('button',{name:'Xem trong thư viện'}).waitFor();assert.equal(saveCalls,1);assert.equal(entries[0].title,'Lời giải được biên tập');assert.equal(ticket.title,'Vấn đề ticket');
 await page.getByRole('button',{name:'Xóa ticket',exact:true}).click();await page.getByRole('button',{name:'Xác nhận xóa',exact:true}).click();await page.getByRole('heading',{name:'CSKH-000001',exact:true}).waitFor({state:'hidden'});assert.equal(ticket,null);
 await page.goto(`${base}/library?entry=entry-1`);await page.getByRole('heading',{name:'TV-000001',exact:true}).waitFor();await page.getByRole('img',{name:'huong-dan.png'}).waitFor();assert.equal(await page.getByText('Lời giải ticket',{exact:true}).count(),2);
 await page.getByRole('button',{name:'Xem nguồn',exact:true}).click();await page.getByRole('alert').filter({hasText:'Nguồn đã bị xóa'}).waitFor();
 await page.waitForFunction(()=>Array.from(document.images).some(i=>i.alt==='huong-dan.png'&&i.complete&&i.naturalWidth>0));
 await page.screenshot({path:'.local/library-qa/desktop.png',fullPage:true});
 await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).click();const edit=page.getByRole('dialog',{name:'Chỉnh sửa bài thư viện',exact:true});await edit.getByLabel('Lời giải').fill('Nội dung chỉ thuộc thư viện');await edit.getByRole('button',{name:'Lưu thay đổi'}).click();await page.getByText('Nội dung chỉ thuộc thư viện',{exact:true}).first().waitFor();assert.equal(entries[0].resolution,'Nội dung chỉ thuộc thư viện');
 const pdfEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất PDF',exact:true}).click();const pdf=await pdfEvent;await pdf.saveAs('.local/library-qa/library.pdf');assert.ok((await fs.stat('.local/library-qa/library.pdf')).size>1000);
 await page.getByRole('button',{name:'Đóng',exact:true}).click();const excelEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất Excel',exact:true}).click();const excel=await excelEvent;await excel.saveAs('.local/library-qa/library.xlsx');
 await page.goto(`${base}/care-logs?log=${logId}`);await page.getByRole('button',{name:'Lưu vào thư viện',exact:true}).click();await page.getByRole('dialog',{name:'Lưu vào thư viện',exact:true}).getByRole('button',{name:'Lưu vào thư viện',exact:true}).click();await page.getByRole('button',{name:'Xem trong thư viện'}).click();await page.getByRole('heading',{name:'TV-000002',exact:true}).waitFor();assert.equal(entries[1].source_type,'care_log');assert.equal(log.status,'received');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'.local/library-qa/mobile.png',fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Đóng',exact:true}).click();
 profile={...profile,role:'viewer',care_log_access:'read'};await page.goto(`${base}/library?entry=entry-2`);await page.getByRole('heading',{name:'TV-000002',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Chỉnh sửa',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Xóa bài thư viện',exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);const summary={passed:true,productionWrites:0,saveCalls,checks:['resolved-only ticket button','preview preserves source','source deletion retains entry and image','missing source message','independent edit','PDF and Excel download','unfinished care-log save','mobile layout','viewer read-only'],checkedAt:new Date().toISOString()};await fs.writeFile('docs/validation/library-ui.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}catch(e){await page.screenshot({path:'.local/library-qa/failure.png',fullPage:true});console.error(JSON.stringify({error:e.message,errors,unexpected}));process.exitCode=1;}finally{await browser.close();}
