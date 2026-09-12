import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const url=process.env.VITE_SUPABASE_URL;
const service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const states=await Promise.all((await fs.readdir('.local')).filter(x=>/^test-state.*\.json$/.test(x)).map(async name=>JSON.parse(await fs.readFile(`.local/${name}`,'utf8'))));
const must=async q=>{const {data,error}=await q;if(error)throw new Error(error.message);return data;};
const report={at:new Date().toISOString(),deleted:{},retainedTestAdmins:0};
for(const table of ['tickets','staff','systems','categories','departments']){
 const ids=[...new Set(states.flatMap(s=>s[table]||[]))];
 if(ids.length){const rows=await must(service.from(table).delete().in('id',ids).select('id'));report.deleted[table]=rows.length;}
}
const accounts=[...new Map(states.flatMap(s=>s.accounts).map(x=>[x.id,x])).values()].sort((a,b)=>Number(a.role==='admin')-Number(b.role==='admin'));
for(const account of accounts){
 if(!/^cskh-[^@]+@example\.test$/.test(account.email))throw new Error('Unexpected account outside test fixture naming');
 const lookup=await service.auth.admin.getUserById(account.id);
 if(lookup.error?.status===404||lookup.error?.code==='user_not_found')continue;
 if(lookup.error)throw new Error(lookup.error.message);
 const admins=await must(service.from('app_users').select('id').eq('role','admin').eq('active',true));
 if(admins.length===1&&admins[0].id===account.id){report.retainedTestAdmins++;continue;}
 await must(service.auth.admin.deleteUser(account.id));report.deleted.accounts=(report.deleted.accounts||0)+1;
}
// Ask the existing cleanup worker to drain jobs while a private test admin remains.
for(const account of accounts.filter(x=>x.role==='admin')){
 const profile=await must(service.from('app_users').select('id').eq('id',account.id).eq('active',true).maybeSingle());if(!profile)continue;
 const member=createClient(url,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
 if((await member.auth.signInWithPassword(account)).error)continue;
 for(let batch=0;batch<10;batch++){const response=await member.functions.invoke('storage-cleanup',{body:{}});if(response.error){const details=await response.error.context?.json().catch(()=>null);throw new Error(`Storage worker ${response.error.context?.status}: ${details?.error||'request failed'}`);}const result=response.data;if(result.failed)throw new Error('Storage cleanup still has failed jobs');if(result.removed<100)break;}
 await member.auth.signOut();break;
}
const ref=new URL(url).hostname.split('.')[0];
// Reset the development sequence only if the entire ticket table is empty.
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:"begin;lock table public.tickets in access exclusive mode;do $$ begin if not exists(select 1 from public.tickets) then perform setval('public.ticket_number_seq',1,false);end if;end $$;commit;"})});
if(!response.ok)throw new Error(`Sequence cleanup ${response.status}`);
await fs.writeFile('docs/validation/cleanup.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
