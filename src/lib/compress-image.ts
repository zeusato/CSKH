export const IMAGE_COMPRESSION_THRESHOLD = 300 * 1024;
const cache = new WeakMap<File, Promise<File>>();

async function animated(file: File) {
 if (file.type === 'image/jpeg') return false;
 const data = new Uint8Array(await file.arrayBuffer());
 const view = new DataView(data.buffer);
 const tag = (offset: number) => String.fromCharCode(...data.subarray(offset, offset + 4));
 // Preserve APNG / animated WebP instead of flattening to the first frame.
 if (file.type === 'image/png') {
  for (let offset = 8; offset + 12 <= data.length;) {
   const length = view.getUint32(offset);
   if (tag(offset + 4) === 'acTL') return true;
   if (tag(offset + 4) === 'IDAT') break;
   offset += length + 12;
  }
 } else if (file.type === 'image/webp') {
  for (let offset = 12; offset + 8 <= data.length;) {
   const length = view.getUint32(offset + 4, true);
   if (tag(offset) === 'ANIM' || tag(offset) === 'ANMF') return true;
   offset += 8 + length + (length % 2);
  }
 }
 return false;
}

async function run(file: File): Promise<File> {
 try {
  if (await animated(file)) return file;
  return await new Promise<File>(resolve => {
   const worker = new Worker(new URL('../workers/image.worker.ts', import.meta.url), {type:'module'});
   let finished = false;
   const finish = (blob?: Blob | null) => {
    if (finished) return; finished = true; clearTimeout(timeout); worker.terminate();
    if (!blob || !['image/png','image/webp'].includes(blob.type) || blob.size === 0 || blob.size > file.size * .95) { resolve(file); return; }
    const extension = blob.type === 'image/webp' ? 'webp' : 'png';
    const name = file.name.replace(/\.[^.]+$/, '').slice(0, 235) + '.' + extension;
    resolve(new File([blob],name,{type:blob.type,lastModified:file.lastModified}));
   };
   const timeout = setTimeout(() => finish(), 15000);
   worker.onmessage = (event: MessageEvent<{blob: Blob | null}>) => finish(event.data.blob);
   worker.onerror = () => finish();
   worker.onmessageerror = () => finish();
   try { worker.postMessage({file}); } catch { finish(); }
  });
 } catch { return file; }
}

export function compressImage(file: File): Promise<File> {
 if (file.size <= IMAGE_COMPRESSION_THRESHOLD) return Promise.resolve(file);
 let pending = cache.get(file);
 if (!pending) { pending = run(file); cache.set(file, pending); }
 return pending;
}
