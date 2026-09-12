import fs from 'node:fs/promises';
import path from 'node:path';
const privateNames=['SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN','DATABASE_URL'];
const secrets=privateNames.flatMap(name=>process.env[name]?[{name,value:process.env[name]}]:[]);
const files=[];async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())await walk(file);else if(/\.(js|css|html|json|map)$/.test(file))files.push(file);}}
await walk('dist');for(const file of files){const contents=await fs.readFile(file,'utf8');for(const secret of secrets)if(contents.includes(secret.value))throw new Error(`Private configuration ${secret.name} was found in a public build file`);}
const report={at:new Date().toISOString(),filesChecked:files.length,privateValuesChecked:secrets.length,passed:true};await fs.writeFile('docs/validation/public-bundle.json',JSON.stringify(report,null,2));console.log('PASS: frontend build contains no configured privileged keys.');
