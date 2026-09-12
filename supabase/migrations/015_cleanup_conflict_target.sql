-- A RETURNS TABLE output variable named path must not be used as an unqualified
-- ON CONFLICT target; name the unique constraint to avoid PL/pgSQL ambiguity.
create or replace function public.claim_storage_gc(p_limit int default 100)
returns table(id bigint,path text,attempts int)
language plpgsql security definer set search_path='' as $$
begin
 delete from public.ticket_attachments where state='pending' and created_at<now()-interval '24 hours';
 insert into private.storage_gc_jobs(path)
 select o.name from storage.objects o where o.bucket_id='ticket-images' and o.created_at<now()-interval '1 hour'
 and not exists(select 1 from public.ticket_attachments a where a.path=o.name)
 limit 1000 on conflict on constraint storage_gc_jobs_path_key do nothing;
 return query with jobs as (
  select j.id from private.storage_gc_jobs j where j.available_at<=now()
  order by j.id for update skip locked limit least(greatest(p_limit,1),500)
 ) update private.storage_gc_jobs j set available_at=now()+interval '5 minutes',attempts=j.attempts+1
 from jobs where j.id=jobs.id returning j.id,j.path,j.attempts;
end; $$;
