// Read-only production checks; no test users, calls or permission changes.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers={apikey:key,Authorization:`Bearer ${key}`};
async function rows(table,select='*'){const r=await fetch(`${base}/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1000`,{headers,signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,`${table} readable`);return r.json();}
async function count(table){const r=await fetch(`${base}/rest/v1/${table}?select=*`,{method:'HEAD',headers:{...headers,Prefer:'count=exact'},signal:AbortSignal.timeout(20000)});assert.ok(r.ok,`${table} count`);return Number(r.headers.get('content-range')?.split('/')[1]);}
const profiles=await rows('app_users','id,role,active,care_log_access,call_log_access');
assert.ok(profiles.every(p=>['none','own','read','manage'].includes(p.call_log_access)));
const backupArg=process.argv.find(x=>x.startsWith('--backup='))?.slice(9);
if(backupArg){const {profiles:before}=JSON.parse(await fs.readFile(backupArg,'utf8'));assert.equal(profiles.length,before.length);for(const p of before){const after=profiles.find(x=>x.id===p.id);assert.ok(after);for(const f of ['role','active','care_log_access'])assert.equal(after[f],p[f]);assert.equal(after.call_log_access,'none');}}
const purposes=await rows('call_purposes');assert.equal(purposes.length,6);assert.ok(purposes.every(p=>p.active));
const counts={};for(const t of ['call_logs','call_followups','tickets','care_logs','library_entries'])counts[t]=await count(t);
const denied=[];for(const t of ['call_logs','call_followups','call_purposes']){const r=await fetch(`${base}/rest/v1/${t}?select=*&limit=1`,{headers:{apikey:process.env.VITE_SUPABASE_ANON_KEY},signal:AbortSignal.timeout(20000)});assert.ok([401,403].includes(r.status),`${t} anonymous denied`);denied.push(t);}
const r=await fetch(`${base}/rest/v1/rpc/search_call_logs`,{method:'POST',headers:{apikey:process.env.VITE_SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});assert.ok([401,403].includes(r.status),'Anonymous RPC denied');
const noAuth=await fetch(`${base}/functions/v1/admin-users`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'list'}),signal:AbortSignal.timeout(20000)});assert.equal(noAuth.status,401,'Function rejects unauthenticated caller');
const result={checkedAt:new Date().toISOString(),project:new URL(base).hostname.split('.')[0],counts,profiles:profiles.length,existingPermissionsPreserved:Boolean(backupArg),newAccessDefaultsToNone:profiles.every(p=>p.call_log_access==='none'),purposes:purposes.length,anonymousTablesDenied:denied,anonymousSearchDenied:true,adminFunctionRequiresAuthentication:true,verificationWrites:0};
await fs.writeFile('docs/validation/call-production.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
