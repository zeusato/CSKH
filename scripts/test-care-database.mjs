// Isolated real PostgreSQL (WASM). Never connects to or creates production data.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
const db=new PGlite({extensions:{pgcrypto,unaccent}});let passed=0;
const ids={admin:'00000000-0000-0000-0000-000000000001',writer:'00000000-0000-0000-0000-000000000002',reader:'00000000-0000-0000-0000-000000000003',none:'00000000-0000-0000-0000-000000000004',viewer:'00000000-0000-0000-0000-000000000005',dept:'00000000-0000-0000-0000-000000000010',staff:'00000000-0000-0000-0000-000000000011',system:'00000000-0000-0000-0000-000000000012'};
const one=async(sql,params=[])=> (await db.query(sql,params)).rows[0];
async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function check(name,fn){await fn();passed++;console.log(`PASS ${name}`);}
try{
 await db.exec(`create schema auth;create schema private;create schema extensions;create extension pgcrypto with schema extensions;create extension unaccent with schema extensions;
 create role authenticated;create role anon;create role service_role bypassrls;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth,private,extensions to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;
 create table public.app_users(id uuid primary key references auth.users(id),name text,role text,active boolean default true,department_id uuid);
 create table public.departments(id uuid primary key,name text);
 create table public.categories(id uuid primary key,name text);
 create table public.systems(id uuid primary key,name text);
 create table public.staff(id uuid primary key,name text,department_id uuid references public.departments(id));
 create function private.normalize_text(value text) returns text language sql stable set search_path='' as $$ select lower(extensions.unaccent(coalesce(value,''))) $$;
 grant select on public.departments,public.categories,public.systems,public.staff to authenticated;
 `);
 await db.exec(await fs.readFile('supabase/migrations/019_care_logs.sql','utf8'));
 await db.exec(await fs.readFile('supabase/migrations/020_care_log_account_user.sql','utf8'));
 await check('migration compiles on PostgreSQL',async()=>assert.equal((await one("select to_regclass('public.care_logs') is not null ok")).ok,true));
 for(const role of ['admin','writer','reader','none','viewer']){await db.query('insert into auth.users values($1)',[ids[role]]);await db.query('insert into public.app_users(id,name,role,care_log_access) values($1,$2,$3,$4)',[ids[role],role,role==='admin'?'admin':role==='viewer'?'viewer':'user',role==='writer'?'write':['reader','viewer'].includes(role)?'read':'none']);}
 await db.query('insert into public.departments values($1,$2)',[ids.dept,'CSKH']);await db.query('insert into public.staff values($1,$2,$3)',[ids.staff,'Nguyễn An',ids.dept]);await db.query('insert into public.systems values($1,$2)',[ids.system,'SH Smart APP']);
 const row={row:2,request_type:'support',description:'Hỗ trợ tra soát khách hàng',response_content:'Đã hỗ trợ',notes:'Ghi chú',system_id:ids.system,category_id:null,receiving_department_id:ids.dept,receiving_staff_id:ids.staff,coordinating_department_id:null,coordinating_staff_id:null,status:'resolved',received_at:'2020-09-17T02:30:00Z',completed_at:'2020-09-17T03:00:00Z'};
 const validate=async rows=>(await one('select public.validate_care_log_import($1::jsonb) result',[JSON.stringify(rows)])).result;
 const commit=async(rows,id,token)=>(await one('select public.commit_care_log_import($1::jsonb,$2::uuid,$3,$4) result',[JSON.stringify(rows),id,'test.xlsx',token])).result;
 await asUser(ids.writer);
 let batch,log;
 await check('preview validates without writing rows',async()=>{const result=await validate([row]);assert.deepEqual(result.errors,[]);assert.equal((await one('select count(*)::int n from public.care_logs')).n,0);assert.equal(typeof result.token,'string');});
 await check('import commits with historical timestamps and audit identity',async()=>{const v=await validate([row]);batch=await commit([row],'00000000-0000-0000-0000-000000000100',v.token);assert.equal(batch.count,1);log=await one('select * from public.care_logs');assert.equal(log.created_by,ids.writer);assert.equal(new Date(log.completed_at).toISOString(),'2020-09-17T03:00:00.000Z');assert.equal(log.entry_source,'excel_import');assert.equal(log.account_user,'');assert.equal(log.import_row_number,2);});
 await check('retry returns original result even after duplicates change',async()=>{const r=await commit([row],'00000000-0000-0000-0000-000000000100','old-token');assert.equal(r.id,batch.id);assert.equal(r.replayed,true);assert.equal((await one('select count(*)::int n from public.care_logs')).n,1);});
 await check('request ID rejects a different payload',async()=>{await assert.rejects(()=>commit([{...row,notes:'Changed'}],'00000000-0000-0000-0000-000000000100','token'),/dữ liệu khác/);});
 await check('failure during the second insert rolls back rows and batch',async()=>{
  await db.exec("reset role;create function private.inject_care_failure() returns trigger language plpgsql as $$begin if new.notes='FAIL_SECOND_ROW' then raise exception 'Injected database failure';end if;return new;end;$$;create trigger inject_care_failure before insert on public.care_logs for each row execute function private.inject_care_failure();");
  await asUser(ids.writer);const rows=[{...row,row:3,description:'First atomic row'},{...row,row:4,notes:'FAIL_SECOND_ROW'}];const v=await validate(rows);assert.deepEqual(v.errors,[]);await assert.rejects(()=>commit(rows,'00000000-0000-0000-0000-000000000199',v.token),/Injected database failure/);assert.equal((await one('select count(*)::int n from public.care_logs')).n,1);const status=(await one("select public.get_care_log_import_result('00000000-0000-0000-0000-000000000199') result")).result;assert.equal(status,null);await db.exec('reset role;drop trigger inject_care_failure on public.care_logs;drop function private.inject_care_failure();');await asUser(ids.writer);
 });
 await check('mixed invalid rows do not partially import',async()=>{const rows=[{...row,row:3,description:'Unique'}, {...row,row:4,receiving_department_id:null}];const v=await validate(rows);assert.equal(v.errors.length,1);const r=await commit(rows,'00000000-0000-0000-0000-000000000101',v.token);assert.ok(r.review);assert.equal((await one('select count(*)::int n from public.care_logs')).n,1);});
 await check('catalog name changes require a new preview',async()=>{const rows=[{...row,description:'Another'}];const v=await validate(rows);await db.exec('reset role');await db.query('update public.systems set name=$1 where id=$2',['CORE',ids.system]);await asUser(ids.writer);const r=await commit(rows,'00000000-0000-0000-0000-000000000102',v.token);assert.ok(r.review);});
 await check('unknown/forged fields and empty payload are rejected',async()=>{assert.equal((await validate([{...row,created_by:ids.admin}])).errors.length,1);await assert.rejects(()=>validate([]));await assert.rejects(()=>validate(null));});
 await check('search handles Vietnamese, exact code, filtering and cursor without overlap',async()=>{const rows=Array.from({length:5},(_,i)=>({...row,row:i+2,description:`Tra soát phân trang ${i}`}));const v=await validate(rows);await commit(rows,'00000000-0000-0000-0000-000000000103',v.token);const p1=(await one('select public.search_care_logs($1,null,2) r',[JSON.stringify({q:'tra soat',system_id:ids.system})])).r;const p2=(await one('select public.search_care_logs($1,$2,2) r',[JSON.stringify({q:'tra soat',system_id:ids.system}),JSON.stringify(p1.nextCursor)])).r;assert.equal(p1.items.length,2);assert.equal(p2.items.length,2);assert.ok(!p1.items.some(a=>p2.items.some(b=>a.id===b.id)));const exact=(await one('select public.search_care_logs($1) r',[JSON.stringify({q:log.code})])).r;assert.equal(exact.items[0].id,log.id);});
 await check('writes protect audit and import metadata',async()=>{await assert.rejects(()=>db.query('update public.care_logs set created_by=$1 where id=$2',[ids.admin,log.id]),/permission denied/);await assert.rejects(()=>db.query('update public.care_logs set import_batch_id=null where id=$1',[log.id]),/permission denied/);});
 await check('version checks and reopening completion',async()=>{const a=await db.query("update public.care_logs set status='in_progress' where id=$1 and version=1 returning version,completed_at",[log.id]);assert.equal(a.rows[0].version,2);assert.equal(a.rows[0].completed_at,null);const b=await db.query("update public.care_logs set notes='Stale' where id=$1 and version=1 returning id",[log.id]);assert.equal(b.rows.length,0);});
 for(const role of ['reader','viewer','none'])await check(`${role} cannot write or import`,async()=>{await asUser(ids[role]);await assert.rejects(()=>validate([row]),/Không có quyền/);await assert.rejects(()=>db.query("insert into public.care_logs(request_type,description,receiving_department_id,received_at) values('support','blocked',$1,now())",[ids.dept]),/row-level security/);const removed=await db.query('delete from public.care_logs returning id');assert.equal(removed.rows.length,0);const n=(await one('select count(*)::int n from public.care_logs')).n;assert.equal(n,role==='none'?0:6);});
 await check('non-member search is denied, including direct RPC',async()=>{await asUser(ids.none);await assert.rejects(()=>one('select public.search_care_logs()'),/Không có quyền/);await db.exec('reset role;set role anon');await assert.rejects(()=>one('select public.search_care_logs()'),/permission denied/);});
 await check('revocation takes effect with existing user claims',async()=>{await db.exec('reset role');await db.query("update public.app_users set care_log_access='none' where id=$1",[ids.writer]);await asUser(ids.writer);await assert.rejects(()=>validate([row]),/Không có quyền/);assert.equal((await one('select count(*)::int n from public.care_logs')).n,0);});
 await check('viewer cannot be assigned write access',async()=>{await db.exec('reset role');await assert.rejects(()=>db.query("update public.app_users set care_log_access='write' where id=$1",[ids.viewer]),/viewer_care_read_only/);});
 await check('active admin has implicit access; inactive admin has none',async()=>{await asUser(ids.admin);assert.equal((await one('select count(*)::int n from public.care_logs')).n,6);await db.exec('reset role');await db.query('update public.app_users set active=false where id=$1',[ids.admin]);await asUser(ids.admin);await assert.rejects(()=>one('select public.care_log_counts()'),/Không có quyền/);});
 await check('manual writer CRUD and referenced catalog deletion',async()=>{
  await db.exec('reset role');await db.query("update public.app_users set care_log_access='write' where id=$1",[ids.writer]);await asUser(ids.writer);
  const created=await one("insert into public.care_logs(request_type,description,receiving_department_id,received_at) values('support','Manual fixture',$1,now()) returning id,version,created_by",[ids.dept]);assert.equal(created.created_by,ids.writer);
  await assert.rejects(()=>db.query("update public.care_logs set coordinating_staff_id=$1 where id=$2",[ids.staff,created.id]),/Nhân sự phối hợp/);
  await db.exec('reset role');await assert.rejects(()=>db.query('delete from public.systems where id=$1',[ids.system]),/foreign key/);await asUser(ids.writer);
  const removed=await db.query('delete from public.care_logs where id=$1 and version=$2 returning id',[created.id,created.version]);assert.equal(removed.rows.length,1);
 });
 await check('account/user text round-trips through manual CRUD, import, search and duplicate checks',async()=>{
  await db.exec('begin');
  try{
   const manual=await one("insert into public.care_logs(request_type,description,account_user,receiving_department_id,received_at) values('support','Account fixture',$1,$2,now()) returning id,account_user",['  001234567890123456  ',ids.dept]);
   assert.equal(manual.account_user,'001234567890123456');
   const found=(await one('select public.search_care_logs($1) r',[JSON.stringify({q:'001234567890123456'})])).r;
   assert.equal(found.items[0].id,manual.id);assert.equal(found.items[0].account_user,manual.account_user);
   const updated=await one('update public.care_logs set account_user=$1 where id=$2 returning account_user',['user.name@shs',manual.id]);assert.equal(updated.account_user,'user.name@shs');
   await db.query('update public.care_logs set account_user=$1 where id=$2',['',manual.id]);
   const imported=[{...row,description:'Unique account issue',account_user:'001234567890123456'},{...row,row:3,description:'Unique account issue',account_user:'069C387999'}];
   const v=await validate(imported);assert.deepEqual(v.errors,[]);assert.deepEqual(v.warnings,[]);
   const result=await commit(imported,'00000000-0000-0000-0000-000000000301',v.token);assert.equal(result.count,2);
   const saved=(await db.query('select account_user from public.care_logs where import_batch_id=$1 order by import_row_number',[result.id])).rows;
   assert.deepEqual(saved.map(x=>x.account_user),imported.map(x=>x.account_user));
   assert.ok((await validate([imported[0]])).warnings.some(x=>x.message.includes('Tương tự')));
   assert.deepEqual((await validate([{...imported[0],account_user:'different-user'}])).warnings,[]);
   assert.equal((await validate([{...row,account_user:'x'.repeat(256)}])).errors.length,1);
   assert.equal((await validate([{...row,account_user:123456}])).errors.length,1);
   const changedPayload=[{...imported[0],account_user:'another-user'}];
   const originalValidation=await validate([imported[0]]);
   assert.ok((await commit(changedPayload,'00000000-0000-0000-0000-000000000302',originalValidation.token)).review);
  }finally{await db.exec('rollback');}
 });
 await check('maximum 1000-row import validates and commits atomically',async()=>{
  const rows=Array.from({length:1000},(_,i)=>({...row,row:i+2,description:`Mẫu tải giới hạn ${i}`,received_at:new Date(Date.UTC(2020,0,1,0,i)).toISOString(),status:'received',completed_at:null}));
  const started=performance.now();const v=await validate(rows);assert.equal(v.errors.length,0);const result=await commit(rows,'00000000-0000-0000-0000-000000000200',v.token);assert.equal(result.count,1000);assert.equal((await one('select count(*)::int n from public.care_logs')).n,1006);console.log(JSON.stringify({local1000RowsMs:Math.round(performance.now()-started)}));await assert.rejects(()=>validate([...rows,{...row,row:1002}]),/1.000/);
 });
 console.log(JSON.stringify({passed,engine:'PGlite PostgreSQL',productionWrites:0}));
 await fs.mkdir('docs/validation',{recursive:true});await fs.writeFile('docs/validation/care-log-database.json',JSON.stringify({passed,engine:'PGlite PostgreSQL',productionWrites:0,checkedAt:new Date().toISOString()},null,2)+'\n');
}catch(error){console.error(JSON.stringify({message:error.message,code:error.code,where:error.where,passed}));process.exitCode=1;}finally{await db.close();}
