import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const url=process.env.VITE_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0];
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const client=createClient(url,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const must=async q=>{const {data,error}=await q;if(error)throw new Error(error.message);return data;};
const state=JSON.parse(await fs.readFile('.local/test-state.json','utf8'));
const profiles=await must(service.from('app_users').select('id').eq('active',true));
const account=state.accounts.find(x=>profiles.some(p=>p.id===x.id));if(!account)throw new Error('Active test account required');
await must(client.auth.signInWithPassword(account));
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw new Error(`SQL ${r.status}`);return r.json();}
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
try{
 const ticket=await must(client.from('tickets').insert({title:'[KIỂM THỬ DỌN ẢNH] Xóa và thử lại khi Storage lỗi'}).select('id').single());state.tickets.push(ticket.id);await fs.writeFile('.local/test-state.json',JSON.stringify(state,null,2));
 const id=crypto.randomUUID(),path=`${ticket.id}/${id}`;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await must(client.from('ticket_attachments').insert({id,ticket_id:ticket.id,name:'cleanup.png',mime_type:'image/png',size:png.length,path}));
 await must(client.storage.from('ticket-images').upload(path,png,{contentType:'image/png'}));await must(client.from('ticket_attachments').update({state:'ready'}).eq('id',id));
 await check('Authenticated client cannot claim privileged cleanup jobs',async()=>assert.ok((await client.rpc('claim_storage_gc',{p_limit:1})).error));
 await must(client.from('tickets').delete().eq('id',ticket.id));
 await check('Deleting ticket removes metadata and enqueues its image',async()=>{assert.equal((await must(service.from('ticket_attachments').select('id').eq('ticket_id',ticket.id))).length,0);const rows=await sql(`select id from private.storage_gc_jobs where path='${path}'`);assert.equal(rows.length,1);});
 const jobs=await must(service.rpc('claim_storage_gc',{p_limit:100}));const job=jobs.find(x=>x.path===path);assert.ok(job);
 await check('Temporary Storage failure records a retry with backoff',async()=>{await must(service.rpc('finish_storage_gc',{p_id:job.id,p_error:'Synthetic Storage failure for retry test'}));const [row]=await sql(`select attempts,available_at>now() as delayed,last_error is not null as recorded from private.storage_gc_jobs where id=${Number(job.id)}`);assert.ok(row.delayed&&row.recorded&&row.attempts>=1);});
 // Advance only this synthetic job's retry timestamp to avoid a minute-long test.
 await sql(`update private.storage_gc_jobs set available_at=now() where id=${Number(job.id)}`);
 await check('Worker retry removes the actual private object and finishes job',async()=>{const result=await must(client.functions.invoke('storage-cleanup',{body:{}}));assert.equal(result.failed,0);assert.equal((await must(service.storage.from('ticket-images').list(ticket.id))).length,0);assert.equal((await sql(`select id from private.storage_gc_jobs where id=${Number(job.id)}`)).length,0);});
}catch(error){console.error('FAIL',error.message);process.exitCode=1;}finally{await fs.writeFile('docs/validation/storage-cleanup.json',JSON.stringify({at:new Date().toISOString(),migration:'015_cleanup_conflict_target.sql',checks},null,2));await client.auth.signOut();}
