import fs from 'node:fs/promises';
const ref=new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw new Error(await r.text());return r.json();}
const state=JSON.parse(await fs.readFile('.local/test-state.json','utf8'));const id=state.accounts.find(x=>x.role==='user').id;
const def=(await sql("select pg_get_functiondef(oid) as source from pg_proc where proname='search_shared_tickets' and pronamespace='private'::regnamespace"))[0].source;
const instrumented=def.replace('STABLE','VOLATILE').replace('private.search_shared_tickets','pg_temp.explain_ticket_search').replace('execute statement into result;return result;',"execute 'explain (analyze,buffers,format json) '||statement into result;return result;");
const result=await sql(`begin;${instrumented};set local role authenticated;select set_config('request.jwt.claims','${JSON.stringify({sub:id,role:'authenticated'})}',true);select pg_temp.explain_ticket_search(p_query:='khong nhan otp');rollback;`);
await fs.writeFile('docs/validation/search-plan.json',JSON.stringify(result,null,2));console.log('Đã ghi execution plan của lõi có kiểm tra thành viên.');
