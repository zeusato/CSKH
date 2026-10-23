import {readFileSync} from 'node:fs';
// Management API nhận một file cho mỗi Edge Function: chèn module supabase/functions/_shared vào chỗ dòng import.
// Dùng chung cho deploy-functions.mjs và các test chạy index.ts trong Node.
export function bundleFunctionSync(name,root='supabase/functions'){
 let code=readFileSync(`${root}/${name}/index.ts`,'utf8');
 for(const [line,lib] of [...code.matchAll(/^import [^\n]*from '\.\.\/_shared\/([\w-]+)\.ts';\r?\n/gm)]){
  const shared=readFileSync(`${root}/_shared/${lib}.ts`,'utf8').replace(/^export /gm,'');
  code=code.replace(line,()=>`// --- _shared/${lib}.ts ---\n${shared}// --- hết _shared/${lib}.ts ---\n`);
 }
 return code;
}
export const bundleFunction=async(name,root)=>bundleFunctionSync(name,root);
