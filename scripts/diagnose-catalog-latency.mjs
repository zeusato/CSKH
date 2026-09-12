import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const ref=new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
async function sql(query){const start=performance.now();const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Management SQL ${response.status}`);return {data:await response.json(),managementRoundTripMs:Math.round(performance.now()-start)};}
const {data:admins}=await sql("select id from public.app_users where role='admin' and active order by created_at limit 1");if(!admins.length)throw new Error('Active Admin required to simulate authenticated RLS');
const claims=JSON.stringify({sub:admins[0].id,role:'authenticated'});
const results={at:new Date().toISOString(),method:'EXPLAIN ANALYZE as authenticated with existing Admin membership, every insert rolled back; no Auth session created',writes:[],reads:[]};
for(const table of ['departments','systems'])for(let sample=0;sample<4;sample++){
 const id=crypto.randomUUID(),name=`DIAGNOSTIC-${id}`;
 const result=await sql(`begin;set local role authenticated;select set_config('request.jwt.claims','${claims}',true);explain(analyze,buffers,format json) insert into public.${table}(id,name) values('${id}','${name}') returning id,name,created_at,created_by;rollback;`);
 const plan=result.data.find(x=>x['QUERY PLAN'])?.['QUERY PLAN'][0];results.writes.push({table,sample,executionMs:plan['Execution Time'],planningMs:plan['Planning Time'],triggers:plan.Triggers,managementRoundTripMs:result.managementRoundTripMs});
}
for(const table of ['categories','systems','departments','staff','app_users']){
 const result=await sql(`begin;set local role authenticated;select set_config('request.jwt.claims','${claims}',true);explain(analyze,buffers,format json) select * from public.${table} order by name,id limit 1000;rollback;`);
 const plan=result.data.find(x=>x['QUERY PLAN'])?.['QUERY PLAN'][0];results.reads.push({table,rows:plan.Plan['Actual Rows'],executionMs:plan['Execution Time'],managementRoundTripMs:result.managementRoundTripMs});
}
const state=await sql("select pid,state,wait_event_type,wait_event,extract(epoch from now()-query_start)::int as seconds from pg_stat_activity where datname=current_database() and state='active' and pid<>pg_backend_pid();");results.otherActiveQueries=state.data;
await fs.writeFile('docs/validation/catalog-latency.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
