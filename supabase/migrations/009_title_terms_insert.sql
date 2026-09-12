create or replace function private.sync_title_terms() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if new.title_search=old.title_search then return new;end if;
  delete from private.ticket_title_terms where ticket_id=new.id;
 end if;
 insert into private.ticket_title_terms(ticket_id,term) select new.id,unnest(tsvector_to_array(new.title_vector));
 return new;
end; $$;
