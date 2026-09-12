import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
const state=JSON.parse(await fs.readFile('.local/test-state.json','utf8'));
const url=process.env.VITE_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0];
const make=()=>createClient(url,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});
const anon=make(),user=make(),service=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const identity=state.accounts.find(x=>x.role==='user');
const must=async q=>{const {data,error}=await q;if(error)throw new Error(error.message);return data;};
await must(user.auth.signInWithPassword(identity));
const checks=[];async function check(name,fn){await fn();checks.push(name);console.log('PASS',name);}
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw new Error(`Management SQL ${r.status}`);return r.json();}
try{
 await check('Anonymous cannot execute search RPC',async()=>assert.ok((await anon.rpc('search_tickets',{p_query:''})).error));
 await check('Active ordinary member can search shared tickets',async()=>{const data=await must(user.rpc('search_tickets',{p_query:'',p_limit:1}));assert.equal(data.items.length,1);});
 await check('SQL-like parameters remain data and cannot bypass filters',async()=>{for(const value of ["' OR true --","x'); select pg_sleep(10); --",'%_\\']){const data=await must(user.rpc('search_tickets',{p_query:value,p_status:"resolved' OR true --",p_sort:'created_at;select pg_sleep(10)',p_date_field:'received_at;select pg_sleep(10)'}));assert.equal(data.items.length,0);}});
 await check('Locked member with existing JWT cannot search or read detail',async()=>{await must(service.from('app_users').update({active:false}).eq('id',identity.id));try{for(const query of ['', 'khong nhan otp']){const data=await must(user.rpc('search_tickets',{p_query:query}));assert.deepEqual(data.items,[]);assert.equal(data.hasMore,false);}assert.deepEqual(await must(user.from('tickets').select('id').limit(1)),[]);}finally{await must(service.from('app_users').update({active:true}).eq('id',identity.id));}});
 await check('JWT user metadata does not grant administration',async()=>{await must(user.auth.updateUser({data:{role:'admin'}}));assert.ok((await user.functions.invoke('admin-users',{body:{action:'list'}})).error);});
 await check('Missing membership cannot read through definer core',async()=>{const result=await sql(`begin;set local role authenticated;select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}',true);select private.search_shared_tickets() as result;rollback;`);assert.deepEqual(result.find(x=>x.result)?.result.items,[]);});
 await check('Source RLS enabled, private search fixed path, anonymous revoked',async()=>{const tables=await sql("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname in ('tickets','ticket_attachments','app_users','categories','systems','departments','staff')");assert.equal(tables.length,7);assert.ok(tables.every(x=>x.relrowsecurity));const [fn]=await sql("select p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') as anon_allowed from pg_proc p where p.oid='private.search_shared_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz)'::regprocedure");assert.equal(fn.prosecdef,true);assert.ok(fn.proconfig.includes('search_path=""'));assert.equal(fn.anon_allowed,false);const [derived]=await sql("select to_regclass('private.ticket_title_terms') as relation");assert.equal(derived.relation,null);});
}catch(error){console.error('FAIL',error.message);process.exitCode=1;}finally{await fs.writeFile('docs/validation/search-security.json',JSON.stringify({at:new Date().toISOString(),migration:'014_bounded_search_pages.sql',checks},null,2));}
