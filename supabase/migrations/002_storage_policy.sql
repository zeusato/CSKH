-- Qualify the outer object name: attachment rows have a name column too.
alter policy cskh_image_read on storage.objects using (
 bucket_id='ticket-images' and (select private.is_active_user()) and exists(
 select 1 from public.ticket_attachments a where a.path=storage.objects.name and a.state='ready')
);
alter policy cskh_image_upload on storage.objects with check (
 bucket_id='ticket-images' and (select private.is_active_user()) and exists(
 select 1 from public.ticket_attachments a where a.path=storage.objects.name and a.state='pending')
);
