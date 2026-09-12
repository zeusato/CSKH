import fs from 'node:fs/promises';
const previous=await fs.readFile('supabase/migrations/006_exact_code_index.sql','utf8');
const source=previous.slice(previous.indexOf('create or replace function'))
 .replace('public.search_tickets(', 'private.search_shared_tickets(')
 .replace('security invoker', 'security definer')
 .replace("set plan_cache_mode='force_custom_plan' as", "set plan_cache_mode='force_custom_plan' set jit='off' as")
 .replace('begin\n', "begin\n -- The approved live-membership guard remains before every ticket read.\n if not private.is_active_user() then return jsonb_build_object('items','[]'::jsonb,'hasMore',false,'nextCursor',null);end if;\n");
if(!source.includes('if not private.is_active_user()'))throw new Error('Missing mandatory gate');
await fs.writeFile('supabase/migrations/013_gated_ranked_pages.sql', '-- Read each rank tier only until the requested page is filled.\n'+source);
