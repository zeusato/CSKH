import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import pg from 'pg';
const url=process.env.VITE_SUPABASE_URL;
const ref=new URL(url).hostname.split('.')[0];
let client;
async function query(sql){
 if(process.env.DATABASE_URL){
  client??=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true}});
  if(!client._connected)await client.connect();
  return (await client.query(sql)).rows;
 }
 if(!process.env.SUPABASE_ACCESS_TOKEN)throw new Error('Cần DATABASE_URL hoặc SUPABASE_ACCESS_TOKEN trong .env để tạo schema.');
 const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query:sql})});
 if(!r.ok)throw new Error(`SQL API ${r.status}: ${await r.text()}`);
 return r.json();
}
try{
 await query('create schema if not exists private; create table if not exists private.cskh_migrations(name text primary key, checksum text not null, applied_at timestamptz not null default now());');
 const applied=await query('select name,checksum from private.cskh_migrations');
 for(const name of (await fs.readdir('supabase/migrations')).filter(x=>x.endsWith('.sql')).sort()){
  const sql=await fs.readFile(`supabase/migrations/${name}`,'utf8');const checksum=crypto.createHash('sha256').update(sql).digest('hex');
  const prior=applied.find(x=>x.name===name);
  if(prior){if(prior.checksum!==checksum)throw new Error(`Migration ${name} đã thay đổi sau khi chạy.`);console.log(`${name}: đã có`);continue;}
  await query(`begin;\n${sql}\ninsert into private.cskh_migrations(name,checksum) values('${name}','${checksum}');\ncommit;`);
  console.log(`${name}: hoàn tất`);
 }
}catch(e){console.error(e.message);process.exitCode=1;}finally{await client?.end();}
