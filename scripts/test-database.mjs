import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const url=process.env.VITE_SUPABASE_URL;const key=process.env.VITE_SUPABASE_ANON_KEY;
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const anon=createClient(url,key,{auth:{persistSession:false}});
const runId=Date.now().toString(36);const state={accounts:[],tickets:[],categories:[],systems:[],departments:[],staff:[]};
const results=[];
const must=async(query)=>{const {data,error}=await query;if(error)throw new Error(error.message);return data;};
async function check(name,fn){await fn();results.push(name);console.log(`PASS ${name}`);}
async function account(role){const email=`cskh-${role}-${runId}@example.test`;const password=crypto.randomBytes(18).toString('base64url')+'Aa1!';const {user}=await must(service.auth.admin.createUser({email,password,email_confirm:true}));await must(service.from('app_users').insert({id:user.id,name:`Kiểm thử ${role}`,role}));const client=createClient(url,key,{auth:{persistSession:false}});await must(client.auth.signInWithPassword({email,password}));state.accounts.push({id:user.id,email,password,role});return client;}
try{
 const admin=await account('admin');const user=await account('user');
 await fs.mkdir('.local',{recursive:true});await fs.writeFile('.local/test-state.json',JSON.stringify(state,null,2));
 await check('Anonymous cannot read tickets',async()=>{const r=await anon.from('tickets').select('id');assert.ok(r.error||!r.data?.length);});
 await check('User cannot change own role',async()=>{const r=await user.from('app_users').update({role:'admin'}).eq('id',state.accounts[1].id);assert.ok(r.error);});
 const category=await must(user.from('categories').insert({name:`Kiểm thử ${runId}`}).select().single());state.categories.push(category.id);
 const dept=await must(user.from('departments').insert({name:`Bộ phận kiểm thử ${runId}`}).select().single());state.departments.push(dept.id);
 const staff=await must(user.from('staff').insert({name:'Nhân sự kiểm thử',department_id:dept.id}).select().single());state.staff.push(staff.id);
 const system=await must(admin.from('systems').insert({name:`Hệ thống kiểm thử ${runId}`}).select().single());state.systems.push(system.id);
 await check('User cannot create systems',async()=>{const r=await user.from('systems').insert({name:'Mục không được phép'});assert.ok(r.error);});
 let ticket=await must(user.from('tickets').insert({title:'[KIỂM THỬ] Không nhận được OTP khi đăng nhập',description:'Khách hàng cần hỗ trợ xác thực trên ứng dụng.',category_id:category.id,system_id:system.id,department_id:dept.id,staff_id:staff.id}).select().single());state.tickets.push(ticket.id);
 await check('Server assigns code, actor and timestamps',async()=>{assert.match(ticket.code,/^CSKH-\d{6,}$/);assert.equal(ticket.created_by,state.accounts[1].id);assert.equal(ticket.completed_at,null);});
 await check('Accent-insensitive search with User RLS',async()=>{const r=await must(user.rpc('search_tickets',{p_query:'khong nhan otp'}));assert.ok(r.items.some(x=>x.id===ticket.id));});
 await check('User cannot delete category',async()=>{await user.from('categories').delete().eq('id',category.id);assert.ok(await must(admin.from('categories').select('id').eq('id',category.id).maybeSingle()));});
 await check('Admin cannot delete referenced category',async()=>{const r=await admin.from('categories').delete().eq('id',category.id);assert.ok(r.error);});
 await check('Reject mismatched staff and department',async()=>{const r=await user.from('tickets').update({department_id:null}).eq('id',ticket.id);assert.ok(r.error);});
 await check('Completion and reopen timestamps',async()=>{ticket=await must(user.from('tickets').update({status:'resolved',resolution:'Kiểm tra thông tin đăng ký, hướng dẫn gửi lại mã OTP.'}).eq('id',ticket.id).select().single());assert.ok(ticket.completed_at);const complete=ticket.completed_at;ticket=await must(user.from('tickets').update({description:'Nội dung bổ sung sau xử lý'}).eq('id',ticket.id).select().single());assert.equal(ticket.completed_at,complete);ticket=await must(user.from('tickets').update({status:'in_progress'}).eq('id',ticket.id).select().single());assert.equal(ticket.completed_at,null);});
 await check('Optimistic concurrency rejects stale version',async()=>{const stale=ticket.version;ticket=await must(user.from('tickets').update({resolution:'Đã cập nhật kết quả'}).eq('id',ticket.id).eq('version',stale).select().single());const r=await must(admin.from('tickets').update({resolution:'Không được ghi đè'}).eq('id',ticket.id).eq('version',stale).select());assert.equal(r.length,0);});
 const attachmentId=crypto.randomUUID();const path=`${ticket.id}/${attachmentId}`;const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await check('Private images upload and signed read',async()=>{await must(user.from('ticket_attachments').insert({id:attachmentId,ticket_id:ticket.id,name:'test.png',mime_type:'image/png',size:png.length,path}));await must(user.storage.from('ticket-images').upload(path,png,{contentType:'image/png'}));await must(user.from('ticket_attachments').update({state:'ready'}).eq('id',attachmentId));const signed=await must(user.storage.from('ticket-images').createSignedUrl(path,60));assert.ok(signed.signedUrl);const publicRead=await fetch(`${url}/storage/v1/object/public/ticket-images/${path}`);assert.notEqual(publicRead.status,200);});
 await check('Locked member loses DB and Storage access with existing JWT',async()=>{await must(service.from('app_users').update({active:false}).eq('id',state.accounts[1].id));const r=await must(user.from('tickets').select('id'));assert.equal(r.length,0);const image=await user.storage.from('ticket-images').createSignedUrl(path,60);assert.ok(image.error);await must(service.from('app_users').update({active:true}).eq('id',state.accounts[1].id));});
 await check('User cannot call account administration Edge Function',async()=>{const r=await user.functions.invoke('admin-users',{body:{action:'list'}});assert.ok(r.error);});
 await check('Admin can list accounts through Edge Function',async()=>{const r=await must(admin.functions.invoke('admin-users',{body:{action:'list'}}));assert.ok(r.users.some(x=>x.id===state.accounts[1].id));});
 await check('User deletes ticket; cleanup removes object',async()=>{await must(user.from('tickets').delete().eq('id',ticket.id));const gc=await must(user.functions.invoke('storage-cleanup',{body:{}}));assert.equal(gc.failed,0);const objects=await must(service.storage.from('ticket-images').list(ticket.id));assert.equal(objects.length,0);});
 state.tickets=[];
 console.log(`All ${results.length} database/security checks passed.`);
}catch(error){console.error('FAIL',error.message);process.exitCode=1;}finally{await fs.mkdir('.local',{recursive:true});await fs.writeFile('.local/test-state.json',JSON.stringify(state,null,2));await fs.writeFile('.local/database-test-results.json',JSON.stringify({at:new Date().toISOString(),passed:results},null,2));}
