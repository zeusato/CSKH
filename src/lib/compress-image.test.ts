import {afterEach,expect,it,vi} from 'vitest';
import {compressImage,IMAGE_COMPRESSION_THRESHOLD} from './compress-image';
import {imageQuality,pickImageCandidate} from './image-quality';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('leaves files up to and including 300 KiB byte-for-byte unchanged',async()=>{
 const worker=vi.fn();vi.stubGlobal('Worker',worker);
 for(const size of [1024,IMAGE_COMPRESSION_THRESHOLD]){const file=new File([new Uint8Array(size)],'sample.jpg',{type:'image/jpeg'});expect(await compressImage(file)).toBe(file);}
 expect(worker).not.toHaveBeenCalled();
});
it('uses actual compressed size/type/extension and caches retries for the same File',async()=>{
 const terminate=vi.fn(),created=vi.fn();
 class WorkerStub {onmessage?: (e:unknown)=>void;terminate=terminate;constructor(){created();}postMessage(){queueMicrotask(()=>this.onmessage?.({data:{blob:new Blob([new Uint8Array(60000)],{type:'image/webp'})}}));}}
 vi.stubGlobal('Worker',WorkerStub);
 const input=new File([new Uint8Array(IMAGE_COMPRESSION_THRESHOLD+1)],'Ảnh lỗi.jpg',{type:'image/jpeg',lastModified:42});
 const [one,two]=await Promise.all([compressImage(input),compressImage(input)]);
 expect(one).toBe(two);expect(one.name).toBe('Ảnh lỗi.webp');expect(one.type).toBe('image/webp');expect(one.size).toBe(60000);expect(one.lastModified).toBe(42);
 expect(created).toHaveBeenCalledOnce();expect(terminate).toHaveBeenCalledOnce();
});
it('falls back without losing the original on timeout, unsupported encoding or no saving',async()=>{
 vi.useFakeTimers();
 const terminate=vi.fn();
 class WorkerStub {terminate=terminate;postMessage(){}}
 vi.stubGlobal('Worker',WorkerStub);
 const input=new File([new Uint8Array(400000)],'sample.jpg',{type:'image/jpeg'});
 const result=compressImage(input);await vi.advanceTimersByTimeAsync(15000);expect(await result).toBe(input);expect(terminate).toHaveBeenCalledOnce();
 vi.stubGlobal('Worker',class {onmessage?: (e:unknown)=>void;terminate(){} postMessage(){queueMicrotask(()=>this.onmessage?.({data:{blob:new Blob([new Uint8Array(500000)],{type:'image/webp'})}}));}});
 const second=new File([new Uint8Array(400000)],'sample.jpg',{type:'image/jpeg'});expect(await compressImage(second)).toBe(second);
});
it('does not flatten animated WebP',async()=>{
 const data=new Uint8Array(400000);data.set(new TextEncoder().encode('RIFF'),0);data.set(new TextEncoder().encode('WEBPANIM'),8);
 const worker=vi.fn();vi.stubGlobal('Worker',worker);
 const file=new File([data],'animated.webp',{type:'image/webp'});expect(await compressImage(file)).toBe(file);expect(worker).not.toHaveBeenCalled();
});
it('rejects blurred text edges and changed transparency, accepts identical pixels',()=>{
 const original=new Uint8ClampedArray(32*32*4);
 for(let p=0;p<32*32;p++){const color=p%32<16?0:255;original.set([color,color,color,255],p*4);}
 expect(imageQuality(original,original,32,32).acceptable).toBe(true);
 const blurred=original.slice();for(let y=0;y<32;y++)for(let x=14;x<=17;x++)blurred.set([128,128,128,255],(y*32+x)*4);
 expect(imageQuality(original,blurred,32,32).acceptable).toBe(false);
 const alpha=original.slice();alpha[3]=100;expect(imageQuality(original,alpha,32,32).acceptable).toBe(false);
});
it('prefers near-sized lossless output and rejects negligible savings',()=>{
 expect(pickImageCandidate(1000,[{size:100,lossless:false},{size:115,lossless:true}])).toEqual({size:115,lossless:true});
 expect(pickImageCandidate(1000,[{size:990,lossless:true}])).toBeUndefined();
});
