import fs from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const service=createClient(process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const must=async q=>{const {data,error}=await q;if(error)throw new Error(error.message);return data;};
const states=await Promise.all((await fs.readdir('.local')).filter(x=>/^test-state.*\.json$/.test(x)).map(async name=>JSON.parse(await fs.readFile(`.local/${name}`,'utf8'))));
const known=new Map(states.flatMap(s=>s.accounts||[]).map(x=>[x.id,x.email]));
const users=[];for(let page=1;;page++){const data=await must(service.auth.admin.listUsers({page,perPage:1000}));users.push(...data.users);if(data.users.length<1000)break;}
const candidates=users.filter(user=>known.has(user.id));
for(const user of candidates)if(user.email!==known.get(user.id)||!/^cskh-[^@]+@example\.test$/.test(user.email))throw new Error('Test account identity changed; no deletion performed');
const ids=new Set(candidates.map(x=>x.id));
const profiles=await must(service.from('app_users').select('id,role,active'));
const officialAdmins=profiles.filter(p=>p.active&&p.role==='admin'&&!known.has(p.id)&&users.some(u=>u.id===p.id));
console.log(JSON.stringify({testAccounts:candidates.map(x=>({id:x.id,email:x.email})),officialActiveAdmins:officialAdmins.length,otherAccounts:users.length-candidates.length}));
if(!process.argv.includes('--apply'))process.exit(0);
if(!officialAdmins.length)throw new Error('No active non-test Admin with a matching Auth account; nothing deleted');
for(const user of candidates)await must(service.auth.admin.deleteUser(user.id));
for(const user of candidates){const lookup=await service.auth.admin.getUserById(user.id);if(lookup.data?.user||!(lookup.error?.status===404||lookup.error?.code==='user_not_found'))throw new Error('Cannot confirm test Auth removal');}
const after=await must(service.from('app_users').select('id,role,active'));
if(after.some(p=>ids.has(p.id)))throw new Error('Test profile still exists');
if(!officialAdmins.every(p=>after.some(x=>x.id===p.id&&x.role==='admin'&&x.active)))throw new Error('Official Admin changed during cleanup');
const report={at:new Date().toISOString(),deletedTestAccounts:candidates.length,verifiedAuthRemoval:true,verifiedProfileRemoval:true,officialActiveAdmins:officialAdmins.length};
await fs.writeFile('docs/validation/test-account-removal.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
