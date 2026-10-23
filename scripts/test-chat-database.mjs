// Migration 024 trong PostgreSQL cô lập. Không đọc .env, không kết nối production.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {unaccent} from '@electric-sql/pglite/contrib/unaccent';
import {pg_trgm} from '@electric-sql/pglite/contrib/pg_trgm';
const db=new PGlite({extensions:{pgcrypto,unaccent,pg_trgm}});const checks=[];
const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const ids={admin:uuid(1),user:uuid(2),viewer:uuid(3)};
async function asUser(id){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');}
async function check(label,fn){await fn();checks.push(label);console.log('PASS '+label);}
try{
 await db.exec(`create schema auth;create schema storage;create role authenticated;create role anon;create role service_role bypassrls;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth,storage to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,created_at timestamptz default now());`);
 for(const file of ['001_workspace.sql','016_viewer_role.sql','019_care_logs.sql','023_call_logs.sql','024_chat_access.sql'])await db.exec(await fs.readFile(`supabase/migrations/${file}`,'utf8'));
 for(const [key,id] of Object.entries(ids)){await db.query('insert into auth.users values($1)',[id]);await db.query('insert into public.app_users(id,name,role) values($1,$2,$3)',[id,key,key]);}
 await check('new and existing accounts default to no chat access, admin included',async()=>{const rows=(await db.query('select chat_access,chat_synced_at,chat_sync_error from public.app_users')).rows;assert.equal(rows.length,3);assert.ok(rows.every(r=>r.chat_access==='none'&&r.chat_synced_at===null&&r.chat_sync_error===null));});
 await check('admin and user accept every chat level',async()=>{for(const level of ['read','agent','supervisor','none'])await db.query('update public.app_users set chat_access=$1 where id in ($2,$3)',[level,ids.admin,ids.user]);});
 await check('unknown chat level is rejected',async()=>{await assert.rejects(()=>db.query("update public.app_users set chat_access='owner' where id=$1",[ids.user]),/check constraint/);});
 await check('viewer is limited to read or none',async()=>{await db.query("update public.app_users set chat_access='read' where id=$1",[ids.viewer]);for(const level of ['agent','supervisor'])await assert.rejects(()=>db.query('update public.app_users set chat_access=$1 where id=$2',[level,ids.viewer]),/viewer_chat_read_only/);});
 await check('changing an agent to viewer is rejected by the database',async()=>{await db.query("update public.app_users set chat_access='agent' where id=$1",[ids.user]);await assert.rejects(()=>db.query("update public.app_users set role='viewer' where id=$1",[ids.user]),/viewer_chat_read_only/);});
 await check('sync error text is bounded',async()=>{await assert.rejects(()=>db.query('update public.app_users set chat_sync_error=$1 where id=$2',['x'.repeat(301),ids.user]),/check constraint/);});
 await check('signed-in members can read but never write chat columns',async()=>{await asUser(ids.user);assert.equal((await db.query('select chat_access from public.app_users where id=$1',[ids.user])).rows[0].chat_access,'agent');for(const sql of ["update public.app_users set chat_access='supervisor' where id=$1","update public.app_users set chat_sync_error=null where id=$1"])await assert.rejects(()=>db.query(sql,[ids.user]),/permission denied/);await asUser(ids.admin);await assert.rejects(()=>db.query("update public.app_users set chat_access='supervisor' where id=$1",[ids.admin]),/permission denied/);await db.exec('reset role');});
 const summary={passed:true,checks,checkedAt:new Date().toISOString()};await fs.writeFile('docs/validation/chat-database.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}catch(e){console.error(e);process.exitCode=1;}finally{await db.close();}
