import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await fs.readFile('dist/index.html','utf8');
assert.ok(!html.includes('__SITE_ORIGIN__'),'Unresolved site URL');
function meta(name){const value=html.match(new RegExp(`<meta (?:property|name)="${name}" content="([^"]+)"`))?.[1];assert.ok(value,`Missing ${name}`);return value;}
const image=new URL(meta('og:image'));
assert.equal(image.pathname,'/og/shs-cskh.jpg');assert.equal(meta('twitter:image'),image.href);
assert.equal(meta('og:image:width'),'1200');assert.equal(meta('og:image:height'),'630');
assert.ok(meta('robots').includes('noindex'));
if(process.env.VERCEL)assert.ok(image.protocol==='https:'&&!['localhost','127.0.0.1'].includes(image.hostname),'Production OG URL must be public HTTPS');
const manifest=JSON.parse(await fs.readFile('dist/site.webmanifest','utf8'));
for(const item of [...manifest.icons,{src:'/apple-touch-icon.png',sizes:'180x180'},{src:'/icons/favicon-16.png',sizes:'16x16'},{src:'/icons/favicon-32.png',sizes:'32x32'}]){
 const bytes=await fs.readFile(`dist${item.src}`);const [w,h]=item.sizes.split('x').map(Number);assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);
}
const ico=await fs.readFile('dist/favicon.ico');assert.equal(ico.readUInt16LE(2),1);assert.ok(ico.readUInt16LE(4)>=3);
const jpeg=await fs.readFile('dist/og/shs-cskh.jpg');let dimensions;
for(let offset=2;offset+9<jpeg.length;){assert.equal(jpeg[offset],255);const marker=jpeg[offset+1];const length=jpeg.readUInt16BE(offset+2);if([0xc0,0xc1,0xc2].includes(marker)){dimensions=[jpeg.readUInt16BE(offset+7),jpeg.readUInt16BE(offset+5)];break;}offset+=length+2;}
assert.deepEqual(dimensions,[1200,630]);assert.ok(jpeg.length<1024*1024,'OG image should stay below 1 MB');
console.log('Static site checks: metadata, absolute OG URL, 1200x630 image, manifest and icons passed.');
