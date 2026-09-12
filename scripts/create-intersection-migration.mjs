import fs from 'node:fs/promises';
const source=await fs.readFile('supabase/migrations/007_rls_title_terms.sql','utf8');let fn=source.slice(source.indexOf('create or replace function public.search_tickets'));
const start=fn.indexOf('if token_hits then '),end=fn.indexOf("body_condition:=format('t.search_vector",start);
if(start<0||end<0)throw new Error('Expected token branch missing');
fn=fn.slice(0,start)+`if token_hits then
   select 'title_matches as materialized ('||string_agg(format('select tt.ticket_id from private.ticket_title_terms tt where tt.term >= %L collate "C" and tt.term < %L collate "C"',word,word||chr(65535)),' intersect ')||'),' into title_sources from regexp_split_to_table(regexp_replace(q,'[^[:alnum:] ]',' ','g'),'\\s+') word where word<>'';
   title_condition:='t.id in (select ticket_id from title_matches)';`+fn.slice(end);
fn=fn.replace("escaped text;","escaped text;title_sources text:='';");
fn=fn.replace('$query$,sources,size,size);','$query$,title_sources||sources,size,size);');
fn+="\nalter function public.search_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz) set jit='off';\n";
await fs.writeFile('supabase/migrations/010_title_intersection.sql',fn);
