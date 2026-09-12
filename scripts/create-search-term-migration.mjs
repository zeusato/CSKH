import fs from 'node:fs/promises';
const source=await fs.readFile('supabase/migrations/006_exact_code_index.sql','utf8');
const fn=source.slice(source.indexOf('create or replace function'));
const old="title_condition:=format('t.title_vector@@%L::tsquery',tsq);";
if(!fn.includes(old))throw new Error('Expected title search clause missing');
const replacement=`select string_agg(format('t.id in (select tt.ticket_id from private.ticket_title_terms tt where tt.term >= %L collate "C" and tt.term < %L collate "C")',word,word||chr(65535)),' and ') into title_condition from regexp_split_to_table(regexp_replace(q,'[^[:alnum:] ]',' ','g'),'\\s+') word where word<>'';`;
const schema=`-- PostgreSQL cannot push non-leakproof full-text operators through RLS.
-- A narrow term projection uses leakproof text range comparisons with a B-tree.
-- This table has the SAME active-member RLS and is writable only by the audit trigger.
create table private.ticket_title_terms (
 ticket_id uuid not null references public.tickets(id) on delete cascade,
 term text collate "C" not null,primary key(ticket_id,term)
);
create index ticket_title_terms_term_idx on private.ticket_title_terms(term,ticket_id);
alter table private.ticket_title_terms enable row level security;
create policy title_terms_read on private.ticket_title_terms for select to authenticated using ((select private.is_active_user()));
revoke all on private.ticket_title_terms from public,anon,authenticated;
grant select on private.ticket_title_terms to authenticated;
create function private.sync_title_terms() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' and new.title_search=old.title_search then return new;end if;
 delete from private.ticket_title_terms where ticket_id=new.id;
 insert into private.ticket_title_terms(ticket_id,term) select new.id,unnest(tsvector_to_array(new.title_vector));
 return new;
end; $$;
revoke all on function private.sync_title_terms() from public,anon,authenticated;
create trigger sync_title_terms after insert or update on public.tickets for each row execute function private.sync_title_terms();
insert into private.ticket_title_terms(ticket_id,term) select id,unnest(tsvector_to_array(title_vector)) from public.tickets;
`;
await fs.writeFile('supabase/migrations/007_rls_title_terms.sql',schema+fn.replace(old,replacement));
console.log('Đã tạo migration chỉ mục từ khóa tiêu đề với RLS.');
