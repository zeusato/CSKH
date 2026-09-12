import {execFileSync} from 'node:child_process';
import fs from 'node:fs/promises';
import {loadEnv} from 'vite';
const env={...loadEnv('production',process.cwd(),''),...process.env};
const secrets=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','DATABASE_URL'].map(name=>env[name]).filter(value=>value&&value.length>=20);
let names;
try{names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);}catch{throw new Error('Không đọc được danh sách file Git. Kiểm tra repository và thông báo quyền sở hữu/quyền truy cập của Git phía trên.');}
const issues=[];
for(const name of new Set(names)){
 if(/^(?:\.env(?:\.|$)|\.local\/|\.vercel\/|node_modules\/|dist\/)/.test(name)&&name!=='.env.example')issues.push(`${name}: private/generated file included`);
 if(!/\.(?:[cm]?[jt]sx?|json|md|sql|ya?ml|toml|html|css|txt|py|example)$/.test(name))continue;
 const text=await fs.readFile(name,'utf8');
 if(secrets.some(secret=>text.includes(secret)))issues.push(`${name}: configured private credential found`);
 if(/\bsb_secret_[A-Za-z0-9_-]{20,}|\bsbp_[A-Za-z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text))issues.push(`${name}: possible private credential found`);
 for(const jwt of text.matchAll(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)){
  try{if(JSON.parse(Buffer.from(jwt[0].split('.')[1],'base64url').toString()).role==='service_role')issues.push(`${name}: service-role JWT found`);}catch{}
 }
}
if(issues.length)throw new Error(issues.join('\n'));
console.log(`Git preflight passed: ${new Set(names).size} candidate files, no configured private keys or private/generated folders included. Nothing staged or committed.`);
