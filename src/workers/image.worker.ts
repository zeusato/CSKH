import { imageQuality, pickImageCandidate } from '../lib/image-quality';
import webpWasm from '@jsquash/webp/codec/enc/webp_enc.wasm?url';
import webpSimdWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?url';

// No resize: small text, account numbers and long screenshots retain their pixels.
self.onmessage = async (event: MessageEvent<{file: File}>) => {
 let bitmap: ImageBitmap | undefined;
 try {
  const file = event.data.file;
  bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
  const {width, height} = bitmap;
  if (width * height > 16000000 || width > 16000 || height > 16000) throw new Error('Image exceeds compression memory budget');
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', {willReadFrequently:true});
  if (!context) throw new Error('Canvas unavailable');
  context.drawImage(bitmap, 0, 0); bitmap.close(); bitmap = undefined;
  const original = context.getImageData(0, 0, width, height).data;
  const comparison = new OffscreenCanvas(width, height);
  const check = comparison.getContext('2d', {willReadFrequently:true});
  if (!check) throw new Error('Canvas unavailable');
  const candidates: {blob: Blob; size: number; lossless: boolean; quality?: number}[] = [];
  if (file.type === 'image/png') {
   const png = await canvas.convertToBlob({type:'image/png'});
   if (png.type === 'image/png' && png.size < file.size) candidates.push({blob:png,size:png.size,lossless:true});
   // Native canvas WebP quality=1 is still lossy. Use libwebp for real lossless
   // compression so screenshot text/color edges need not be sacrificed.
   try {
    const {default:encode,init} = await import('@jsquash/webp/encode');
    await init({locateFile:(path:string)=>path.includes('simd')?webpSimdWasm:webpWasm});
    const data = await encode(new ImageData(original,width,height), {lossless:1,near_lossless:100,exact:1,quality:25,method:0});
    const blob = new Blob([data],{type:'image/webp'});
    if (blob.size < file.size) candidates.push({blob,size:blob.size,lossless:true});
   } catch { /* Retain the native codec candidates when WASM is unavailable. */ }
  }
  for (const quality of [.95, .92, .88]) {
   const blob = await canvas.convertToBlob({type:'image/webp',quality});
   // Unsupported formats may silently fall back to PNG: never mislabel the file.
   if (blob.type !== 'image/webp') break;
   if (blob.size >= file.size * .95) continue;
   const decoded = await createImageBitmap(blob);
   try {
    if (decoded.width !== width || decoded.height !== height) continue;
    check.clearRect(0, 0, width, height); check.drawImage(decoded, 0, 0);
    const score = imageQuality(original, check.getImageData(0, 0, width, height).data, width, height);
    if (score.acceptable) candidates.push({blob,size:blob.size,lossless:false,quality});
   } finally { decoded.close(); }
  }
  const chosen = pickImageCandidate(file.size, candidates);
  self.postMessage({blob:chosen?.blob ?? null});
 } catch {
  self.postMessage({blob:null});
 } finally { bitmap?.close(); }
};
