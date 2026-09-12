import fs from 'node:fs/promises';
let source=await fs.readFile('supabase/migrations/013_gated_ranked_pages.sql','utf8');
source=source.replace('limit greatest(0,%5$s-(select count(*) from exacts)))','limit %5$s)');
source=source.replace('where %2$s and not(%3$s) and not(%6$s) and (%8$s)', 'where ((select count(*) from exacts)+(select count(*) from titles))<%5$s and %2$s and not(%3$s) and not(%6$s) and (%8$s)');
source=source.replace('limit greatest(0,%5$s-(select count(*) from exacts)-(select count(*) from titles)))','limit %5$s)');
source=source.replace('-- Read each rank tier only until the requested page is filled.', '-- Use a literal page limit so the planner can stop an ordered index scan early.\n-- At most two rank pages plus an exact code are read; the final visible page is unchanged.');
if(source.includes('limit greatest'))throw new Error('Nonconstant limit remained');
await fs.writeFile('supabase/migrations/014_bounded_search_pages.sql',source);
