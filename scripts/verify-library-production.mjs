import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function read(table,select='*'){
 const rows=[];for(let offset=0;;offset+=1000){const response=await fetch(`${base}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=id&offset=${offset}&limit=1000`,{headers,signal:AbortSignal.timeout(30000)});assert.equal(response.status,200,`${table} REST status`);const page=await response.json();rows.push(...page);if(page.length<1000)return rows;}
}
const [entries,attachments,tickets,sourceImages,careLogs]=await Promise.all([read('library_entries'),read('library_attachments'),read('tickets'),read('ticket_attachments'),read('care_logs','id')]);
const migrated=entries.filter(e=>e.migrated),sources=new Map(tickets.map(t=>[t.id,t]));
assert.equal(new Set(entries.map(e=>e.source_type+':'+e.source_id)).size,entries.length);
for(const e of migrated){const t=sources.get(e.source_id);assert.ok(t);assert.equal(e.title,t.title.trim());assert.equal(e.description,t.description);assert.equal(e.resolution,t.resolution);assert.equal(e.source_version,t.version);const expected=sourceImages.filter(a=>a.ticket_id===t.id&&a.state==='ready');assert.deepEqual(attachments.filter(a=>a.entry_id===e.id).map(a=>a.path).sort(),expected.map(a=>a.path).sort());}
let readableImages=0;
for(const a of attachments){const res=await fetch(`${base}/storage/v1/object/authenticated/ticket-images/${a.path}`,{method:'HEAD',headers,signal:AbortSignal.timeout(15000)});assert.equal(res.status,200,'Library object exists');readableImages++;}
const publicRead=await fetch(`${base}/rest/v1/library_entries?select=id&limit=1`,{headers:{apikey:process.env.VITE_SUPABASE_ANON_KEY}});assert.notEqual(publicRead.status,200,'Anonymous library access must be denied');
const result={checkedAt:new Date().toISOString(),tickets:tickets.length,careLogs:careLogs.length,entries:entries.length,migrated:migrated.length,attachments:attachments.length,readableImages,contentMismatches:0,duplicateSources:0,anonymousDenied:true,verificationWrites:0};
await fs.writeFile('docs/validation/library-production.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
