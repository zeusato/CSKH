import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const ref = new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
async function sql(query) {
 const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }), signal: AbortSignal.timeout(30000) });
 if (!r.ok) throw new Error(`SQL test failed (${r.status}): ${await r.text()}`);
 return r.json();
}
const [{ id }] = await sql("select id from public.app_users where role='admin' and active limit 1");
const ticket = crypto.randomUUID(), number = -crypto.randomInt(100000000, 2000000000);
await sql(`begin;
 set local role authenticated;
 select set_config('request.jwt.claims','${JSON.stringify({ sub: id, role: 'authenticated' })}',true);
 do $$ declare t public.tickets; begin
  insert into public.tickets(id,number,title,origin,customer_name,customer_account,customer_broker)
  values('${ticket}',${number},'DIAGNOSTIC rollback only','customer','Khách mẫu','001234','MG mẫu') returning * into t;
  if t.customer_account <> '001234' or t.customer_name <> 'Khách mẫu' then raise exception 'Customer fields failed'; end if;
  update public.tickets set origin='broker',broker_name='MG mẫu',broker_user='mg01',broker_department='Phòng mẫu',customer_name=null,customer_account=null,customer_broker=null where id='${ticket}' returning * into t;
  if t.broker_user <> 'mg01' or t.customer_account is not null or t.version <> 2 then raise exception 'Switch/update failed'; end if;
  begin update public.tickets set customer_name='Wrong branch' where id='${ticket}'; raise exception 'Mixed branches accepted'; exception when check_violation then null; end;
  begin update public.tickets set origin='invalid' where id='${ticket}'; raise exception 'Invalid source accepted'; exception when check_violation then null; end;
  begin update public.tickets set broker_name=repeat('x',241) where id='${ticket}'; raise exception 'Overlong value accepted'; exception when check_violation then null; end;
  update public.tickets set origin=null,broker_name=null,broker_user=null,broker_department=null where id='${ticket}' returning * into t;
  if t.origin is not null then raise exception 'Legacy null failed'; end if;
 end $$;
 rollback;`);
const [{ remaining }] = await sql(`select count(*)::int as remaining from public.tickets where id='${ticket}'`);
if (remaining !== 0) throw new Error('Diagnostic row was not rolled back');
const report = { at: new Date().toISOString(), passed: ['Authenticated insert/read customer fields', 'Leading zeros preserved', 'Update to broker and version increment', 'Mixed branches rejected', 'Invalid origin rejected', 'Overlong value rejected', 'Legacy null supported', 'Rolled back without retaining fixtures'], method: 'Authenticated role using existing active Admin membership; no Auth session or account created. Explicit negative ticket number avoids consuming the ticket sequence.' };
await fs.writeFile('docs/validation/ticket-origin-db.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
