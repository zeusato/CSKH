// Read-only aggregate statistics; no filenames, signed URLs or image contents.
const ref=new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
const query=`select jsonb_build_object(
 'bucket',(select jsonb_build_object('file_size_limit',file_size_limit,'public',public) from storage.buckets where id='ticket-images'),
 'objects',(select jsonb_build_object('count',count(*),'bytes',coalesce(sum((metadata->>'size')::bigint),0),'largest_bytes',max((metadata->>'size')::bigint)) from storage.objects where bucket_id='ticket-images'),
 'attachments',(select coalesce(jsonb_agg(s),'[]'::jsonb) from (select mime_type,count(*) as count,sum(size) as bytes,round(avg(size)) as average_bytes,max(size) as largest_bytes from public.ticket_attachments where state='ready' group by mime_type) s),
 'tickets',(select count(*) from public.tickets)
 ) as summary;`;
const response=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`Storage inspection failed (${response.status})`);
console.log(JSON.stringify(await response.json(),null,2));
