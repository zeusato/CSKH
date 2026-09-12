import fs from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {createClient} from '@supabase/supabase-js';
const url=process.env.VITE_SUPABASE_URL,ref=new URL(url).hostname.split('.')[0],token=process.env.SUPABASE_ACCESS_TOKEN;
const state=JSON.parse(await fs.readFile('.local/test-state.json','utf8'));const identity=state.accounts.find(x=>x.role==='user');
const rowCount=Number(process.argv.find(x=>x.startsWith('--rows='))?.split('=')[1]||50000);const concurrency=Number(process.argv.find(x=>x.startsWith('--concurrency='))?.split('=')[1]||20);
if(!Number.isInteger(rowCount)||rowCount<100||rowCount>100000||!Number.isInteger(concurrency)||concurrency<1||concurrency>20)throw new Error('Rows must be 100–100000; concurrency must be 1–20.');
const marker=`BENCH_${Date.now()}`;const results={at:new Date().toISOString(),rows:rowCount,concurrency,role:'authenticated (User)',marker,queries:[],sql:[],environment:'Development project; synthetic Vietnamese tickets; warm API connections after login'};
async function sql(query){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw new Error(`SQL ${r.status}: ${await r.text()}`);return r.json();}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
try{
 console.log(`Dọn dữ liệu cũ và tạo ${rowCount} ticket tổng hợp.`);
 await sql('vacuum (analyze) public.tickets');
 await sql(`insert into public.tickets(title,description,resolution,status,received_at)
 select '${marker} '||(array['Không nhận được OTP đăng nhập','Sai lệch sức mua chứng khoán','Hướng dẫn chuyển tiền','Không hiển thị danh mục đầu tư','Thắc mắc phí giao dịch','Cập nhật thông tin khách hàng','Tra cứu lệnh khớp','SH Smart không tải dữ liệu'])[1+(i%8)]||' '||i,
 repeat((array['Khách hàng phản ánh không nhận tin nhắn xác thực. ','TVĐT cần kiểm tra nghiệp vụ chuyển tiền vào tài khoản. ','Đã tiếp nhận câu hỏi về trạng thái lệnh giao dịch. '])[1+(i%3)],1+(i%12)),
 case when i%4=0 then 'Đã xác minh nguyên nhân và hướng dẫn khách hàng thực hiện lại thao tác. Tham chiếu hồ sơ hỗ trợ.' else '' end,
 (array['resolved','received','in_progress','cancelled'])[1+(i%4)],now()-make_interval(mins=>i*5)
 from generate_series(1,${rowCount}) i;
 analyze public.tickets;`);
 await sql('vacuum (analyze) public.tickets');
 results.environment+='; VACUUM ANALYZE after bulk import and after prior fixture deletion';
 const clients=await Promise.all(Array.from({length:concurrency},async()=>{const c=createClient(url,process.env.VITE_SUPABASE_ANON_KEY,{auth:{persistSession:false}});const login=await c.auth.signInWithPassword({email:identity.email,password:identity.password});if(login.error)throw login.error;return c;}));
 results.migration='014_bounded_search_pages.sql';
 results.security='Ordinary User JWT; public invoker wrapper; approved private definer with live membership gate; source RLS remains enabled';
 const projectResponse=await fetch(`https://api.supabase.com/v1/projects/${ref}`,{headers:{Authorization:`Bearer ${token}`}});
 if(projectResponse.ok){const project=await projectResponse.json();results.region=project.region;results.projectStatus=project.status;}
 const scenarios=[{label:'FTS nhiều từ không dấu',args:{p_query:'khong nhan otp'}},{label:'Tìm nội dung nghiệp vụ',args:{p_query:'chuyen tien'}},{label:'Lọc thư viện',args:{p_query:'khach hang',p_status:'resolved'}},{label:'Danh sách mới nhất',args:{p_query:''}},{label:'Từ khóa ngắn',args:{p_query:'sh'}}];
 for(const scenario of scenarios){const times=[];let errors=0;const firstStart=performance.now();const first=await clients[0].rpc('search_tickets',{...scenario.args,p_limit:30});const firstRequestMs=Math.round(performance.now()-firstStart);for(let round=0;round<3;round++)await Promise.all(clients.map(async c=>{const start=performance.now();const r=await c.rpc('search_tickets',{...scenario.args,p_limit:30});times.push(performance.now()-start);if(r.error)errors++;}));const item={label:scenario.label,firstRequestMs,firstRequestError:Boolean(first.error),samples:times.length,p50:Math.round(percentile(times,.5)),p95:Math.round(percentile(times,.95)),max:Math.round(Math.max(...times)),errors,measurement:'One first request after import, then 3 rounds of 20 concurrent requests; database cache not flushed'};results.queries.push(item);console.log(JSON.stringify(item));}
 for(const scenario of scenarios){const claims=JSON.stringify({sub:identity.id,role:'authenticated'});const query=`begin;set local role authenticated;select set_config('request.jwt.claims','${claims}',true);explain (analyze,buffers,format json) select public.search_tickets(p_query:='${scenario.args.p_query}',p_status:=${scenario.args.p_status?`'${scenario.args.p_status}'`:'null'});rollback;`;const times=[];let plan;for(let sample=0;sample<20;sample++){plan=await sql(query);const execution=plan.find(x=>x['QUERY PLAN'])?.['QUERY PLAN']?.[0]?.['Execution Time'];if(typeof execution!=='number')throw new Error('EXPLAIN missing execution time');times.push(execution);}const item={label:scenario.label,samples:times.length,p50:Math.round(percentile(times,.5)),p95:Math.round(percentile(times,.95)),max:Math.round(Math.max(...times)),measurement:'Warm SQL execution, sequential samples after concurrent API load; excludes network, not SQL under 20-way load',plan};results.sql.push(item);console.log(JSON.stringify({sql:item.label,p95:item.p95}));}
}catch(e){console.error(e.message);results.error=e.message;process.exitCode=1;}finally{
 await sql(`delete from public.tickets where title like '${marker} %';analyze public.tickets;`);
 await fs.mkdir('docs/validation',{recursive:true});await fs.writeFile('docs/validation/search-benchmark.json',JSON.stringify(results,null,2));console.log('Đã xóa dữ liệu benchmark và ghi báo cáo docs/validation/search-benchmark.json.');
}
