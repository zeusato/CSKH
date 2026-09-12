import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({compress:vi.fn(),insert:vi.fn(),update:vi.fn(),upload:vi.fn()}));
vi.mock('./compress-image',()=>({compressImage:mocks.compress,IMAGE_COMPRESSION_THRESHOLD:307200}));
vi.mock('./supabase',()=>({supabase:{from:()=>({insert:mocks.insert,update:mocks.update}),storage:{from:()=>({upload:mocks.upload})}}}));
import {uploadImage} from './api';
it('writes metadata and uploads exactly the optimized bytes, with compression before insert',async()=>{
 const original=new File([new Uint8Array(400000)],'capture.png',{type:'image/png'});
 const optimized=new File([new Uint8Array(80000)],'capture.webp',{type:'image/webp'});
 const order:string[]=[];mocks.compress.mockImplementation(async()=>{order.push('compress');return optimized;});
 mocks.insert.mockImplementation(()=>{order.push('insert');return {select:()=>({single:async()=>({data:{},error:null})})};});
 mocks.update.mockReturnValue({eq:async()=>({error:null})});mocks.upload.mockResolvedValue({error:null});
 const stages:string[]=[];const result=await uploadImage('ticket-id',original,stage=>stages.push(stage));
 expect(order).toEqual(['compress','insert']);expect(stages).toEqual(['compressing','uploading']);
 expect(mocks.insert.mock.calls[0][0]).toMatchObject({name:'capture.webp',size:80000,mime_type:'image/webp'});
 expect(mocks.upload.mock.calls[0][1]).toBe(optimized);expect(mocks.upload.mock.calls[0][2].contentType).toBe('image/webp');
 expect(result).toEqual({originalBytes:400000,storedBytes:80000});
});
