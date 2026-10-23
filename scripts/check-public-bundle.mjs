import fs from 'node:fs/promises';
import path from 'node:path';
const privateNames=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','DATABASE_URL','CHAT_ADMIN_KEY','CHAT_ASSERTION_PRIVATE_KEY'];
// Chat: khóa ký assertion và admin key chỉ ở Supabase secrets (CHAT-PLAN §6).
const forbiddenText=['BEGIN PRIVATE KEY','CHAT_ADMIN_KEY','CHAT_ASSERTION'];
const secrets=privateNames.flatMap(name=>process.env[name]?[{name,value:process.env[name]}]:[]);
const files=[];async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(/\.(js|css|html|json|map)$/.test(file))files.push(file);}}
await walk('dist');for(const file of files){const contents=await fs.readFile(file,'utf8');for(const secret of secrets)if(contents.includes(secret.value))throw new Error(`Private configuration ${secret.name} was found in a public build file`);for(const text of forbiddenText)if(contents.includes(text))throw new Error(`${text} was found in public build file ${file}`);}
const report={at:new Date().toISOString(),filesChecked:files.length,privateValuesChecked:secrets.length,forbiddenTextChecked:forbiddenText.length,passed:true};await fs.writeFile('docs/validation/public-bundle.json',JSON.stringify(report,null,2));console.log('PASS: frontend build contains no configured privileged keys.');
