// Configure only Auth URLs after the production domain is known.
// No function deployment, worker-secret rotation, database migration or email.
const raw=process.argv[2]||process.env.SITE_URL||process.env.APP_URL;
if(!raw)throw new Error('Truyền domain: node --env-file=.env scripts/configure-auth-domain.mjs https://your-domain');
const url=new URL(raw);
if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('Cần URL gốc HTTPS, không có đường dẫn hoặc tham số.');
const ref=new URL(process.env.VITE_SUPABASE_URL).hostname.split('.')[0];
const endpoint=`https://api.supabase.com/v1/projects/${ref}/config/auth`;
const headers={Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'};
const response=await fetch(endpoint,{headers,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`Cannot read Auth config (${response.status})`);
const config=await response.json();const redirect=`${url.origin}/reset-password`;
const allow=[...new Set([...(config.uri_allow_list||'').split(',').map(x=>x.trim()).filter(Boolean),redirect])];
const write=await fetch(endpoint,{method:'PATCH',headers,body:JSON.stringify({site_url:url.origin,uri_allow_list:allow.join(',')}),signal:AbortSignal.timeout(30000)});if(!write.ok)throw new Error(`Cannot update Auth domain (${write.status})`);
const check=await fetch(endpoint,{headers,signal:AbortSignal.timeout(30000)});if(!check.ok)throw new Error('Cannot verify Auth domain');const actual=await check.json();
if(actual.site_url!==url.origin||!actual.uri_allow_list.split(',').includes(redirect))throw new Error('Auth domain verification failed');
console.log('Supabase Auth site URL and exact password-recovery redirect verified.');
