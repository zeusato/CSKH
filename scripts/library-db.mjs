import fs from 'node:fs/promises';
import pg from 'pg';

export async function connectDatabase(){
 if(!process.env.DATABASE_URL)throw new Error('Cần DATABASE_URL trong .env.');
 const url=new URL(process.env.DATABASE_URL);
 for(const key of ['sslmode','sslcert','sslkey','sslrootcert'])url.searchParams.delete(key);
 const ca=process.env.DATABASE_SSL_CA_FILE?await fs.readFile(process.env.DATABASE_SSL_CA_FILE,'utf8'):undefined;
 const client=new pg.Client({connectionString:url.toString(),ssl:{rejectUnauthorized:true,...(ca?{ca}:{})},connectionTimeoutMillis:15000});
 await client.connect();return client;
}

if(process.argv[1]?.replaceAll('\\','/').endsWith('/library-db.mjs')){
 let db;
 try{
  db=await connectDatabase();
  const counts=(await db.query(`select (select count(*) from public.tickets) tickets,
   (select count(*) from public.tickets where status='resolved') resolved,
   (select count(*) from public.care_logs) care_logs,
   (select count(*) from public.ticket_attachments where state='ready') ready_images,
   (select coalesce(sum(size),0) from public.ticket_attachments where state='ready') image_bytes,
   to_regclass('public.library_entries') is not null library_exists`)).rows[0];
  console.log(JSON.stringify(counts));
  console.log(JSON.stringify({migrations:(await db.query('select name from private.cskh_migrations order by name')).rows.map(x=>x.name)}));
  if(process.argv.includes('--backup')){
   await db.query('begin isolation level repeatable read read only');
   const snapshot={createdAt:new Date().toISOString(),tables:{}};
   for(const table of ['tickets','ticket_attachments','care_logs','categories','systems','departments','staff'])snapshot.tables[table]=(await db.query(`select * from public.${table}`)).rows;
   snapshot.storage=(await db.query("select id,bucket_id,name,metadata from storage.objects where bucket_id='ticket-images'")).rows;
   await db.query('commit');
   await fs.mkdir('.local/backups',{recursive:true});
   const path=`.local/backups/pre-library-${Date.now()}.json`;
   await fs.writeFile(path,JSON.stringify(snapshot),'utf8');
   console.log(JSON.stringify({backup:path,tableCounts:Object.fromEntries(Object.entries(snapshot.tables).map(([name,rows])=>[name,rows.length])),storageObjects:snapshot.storage.length}));
  }
 }catch(e){console.error(JSON.stringify({error:e.code||e.name,message:e.code?'Database operation failed':e.message}));process.exitCode=1;}finally{await db?.end();}
}
