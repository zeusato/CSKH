import fs from 'node:fs/promises';
async function edit(file,changes){let text=await fs.readFile(file,'utf8');for(const [from,to] of changes){if(!text.includes(from))throw new Error(`Missing replacement: ${file}`);text=text.replaceAll(from,to);}await fs.writeFile(file,text);}
await edit('src/pages/Catalogs.tsx',[
 ["import { supabase } from '../lib/supabase';", "import { saveCatalog,deleteCatalog } from '../lib/catalog-mutations';"],
 ["const {error}=await(edit==='new'?supabase.from(tab).insert(payload):supabase.from(tab).update(payload).eq('id',(edit as CatalogItem).id));if(error)throw error;await cache.invalidateQueries({queryKey:['catalogs']});", "await saveCatalog(cache,tab,payload,edit==='new'?undefined:(edit as CatalogItem).id);"],
 ["const {error}=await supabase.from(tab).delete().eq('id',remove!.id);if(error)throw error;setRemove(null);await cache.invalidateQueries({queryKey:['catalogs']});", "await deleteCatalog(cache,tab,remove!);setRemove(null);"],
]);
await edit('src/lib/api.ts',[
 ["getCatalogs(): Promise<Catalogs>","getCatalogs(signal?: AbortSignal): Promise<Catalogs>"],
 ["const {data,error}=await supabase.from(name).select('*').order('name').order('id').range(offset,offset+999);", "let request=supabase.from(name).select('*').order('name').order('id').range(offset,offset+999);if(signal)request=request.abortSignal(signal);const {data,error}=await request;"],
]);
for(const file of ['src/pages/Catalogs.tsx','src/pages/Users.tsx','src/pages/Tickets.tsx'])await edit(file,[["queryFn:getCatalogs","queryFn:({signal})=>getCatalogs(signal)"]]);
