import fs from 'node:fs/promises';
await fs.mkdir('public/fonts',{recursive:true});
for(const name of ['NotoSans-Regular.ttf','NotoSans-Bold.ttf']){const response=await fetch(`https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/${name}`);if(!response.ok)throw new Error(`Font download ${response.status}`);await fs.writeFile(`public/fonts/${name}`,Buffer.from(await response.arrayBuffer()));console.log(`${name}: đã tải`);}
const license=await fetch('https://raw.githubusercontent.com/notofonts/noto-fonts/main/LICENSE');if(!license.ok)throw new Error('Không tải được giấy phép font.');await fs.writeFile('public/fonts/LICENSE.txt',await license.text());
