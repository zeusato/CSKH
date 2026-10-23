// Read-only backup through the existing service API. Private output is Git-ignored.
import fs from 'node:fs/promises';
const base=process.env.VITE_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!base||!key)throw new Error('Missing server API configuration');
const tables={};
for(const table of ['tickets','ticket_attachments','care_logs','categories','systems','departments','staff']){
 const rows=[];for(let offset=0;;offset+=1000){const response=await fetch(`${base}/rest/v1/${table}?select=*&order=id&offset=${offset}&limit=1000`,{headers:{apikey:key,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${table}: HTTP ${response.status}`);const page=await response.json();rows.push(...page);if(page.length<1000)break;}tables[table]=rows;
}
await fs.mkdir('.local/backups',{recursive:true});const path=`.local/backups/pre-library-rest-${Date.now()}.json`;
await fs.writeFile(path,JSON.stringify({createdAt:new Date().toISOString(),note:'Read-only REST snapshot before migration; rows/attachment metadata, no binary objects; per-table reads are not one transaction.',tables}),'utf8');
console.log(JSON.stringify({backup:path,counts:Object.fromEntries(Object.entries(tables).map(([name,rows])=>[name,rows.length])),resolved:tables.tickets.filter(x=>x.status==='resolved').length}));
