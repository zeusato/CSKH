import fs from 'node:fs/promises';
const ref=new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw new Error(`SQL ${r.status}`);return r.json();}
console.log(await sql("select pg_size_pretty(pg_relation_size('public.tickets')) as heap, pg_size_pretty(pg_total_relation_size('public.tickets')) as total, (select count(*) from public.tickets) as rows;select indexrelname,pg_size_pretty(pg_relation_size(indexrelid)) as size from pg_stat_user_indexes where relname='tickets';"));
const state=JSON.parse(await fs.readFile('.local/test-state.json','utf8'));const id=state.accounts.find(x=>x.role==='user').id;
const [fn]=await sql("select pg_get_functiondef(oid) as source from pg_proc where proname='search_shared_tickets' and pronamespace='private'::regnamespace");
const instrumented=fn.source.replace('STABLE','VOLATILE').replace('private.search_shared_tickets','pg_temp.explain_ticket_search').replace('execute statement into result;return result;',"execute 'explain (analyze,buffers,format json) '||statement into result;return result;");
const result=await sql(`begin;${instrumented};set local role authenticated;select set_config('request.jwt.claims','${JSON.stringify({sub:id,role:'authenticated'})}',true);select pg_temp.explain_ticket_search(p_query:='khach hang',p_status:='resolved');rollback;`);
await fs.writeFile('docs/validation/search-storage-plan.json',JSON.stringify(result,null,2));
function walk(x){if(x&&typeof x==='object'){if(x['Node Type'])console.log(JSON.stringify({node:x['Node Type'],index:x['Index Name'],table:x['Relation Name'],ms:x['Actual Total Time'],rows:x['Actual Rows'],read:x['Shared Read Blocks'],hit:x['Shared Hit Blocks'],filter:x.Filter}));for(const value of Object.values(x))walk(value);}}
walk(result);
