import { afterEach, expect, it, vi } from 'vitest';
import { emptyFilters } from './types';
const db=vi.hoisted(()=>({rpc:vi.fn(),from:vi.fn()}));
vi.mock('./supabase',()=>({supabase:db}));
import { exportTickets } from './export-excel';
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.clearAllMocks();});
it('exports received, in-progress and resolved rows together, preserving blank completion dates', async()=>{
 const states=['received','in_progress','resolved'];
 const tickets=states.map((status,i)=>({id:String(i),code:`CSKH-${i}`,title:'Example',description:'',resolution:'',status,received_at:'2026-09-12T02:00:00Z',created_at:'2026-09-12T02:00:00Z',completed_at:status==='resolved'?'2026-09-12T03:00:00Z':null,updated_at:'2026-09-12T02:00:00Z',origin:null,ticket_attachments:[]}));
 db.rpc.mockResolvedValue({data:{items:tickets.map(t=>({id:t.id})),hasMore:false,nextCursor:null},error:null});
 db.from.mockReturnValue({select:()=>({in:async()=>({data:tickets,error:null})})});
 const messages: {type:string;rows?:unknown[][]}[]=[];
 const click=vi.fn(),terminate=vi.fn();
 class WorkerStub { onmessage?: (e:unknown)=>void; terminate=terminate; postMessage(message:{type:string}){messages.push(message);if(message.type==='finish')this.onmessage?.({data:{buffer:new ArrayBuffer(1)}});} }
 vi.stubGlobal('Worker',WorkerStub);vi.stubGlobal('document',{createElement:()=>({click})});
 vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:test');vi.spyOn(globalThis,'setTimeout').mockReturnValue(1 as unknown as ReturnType<typeof setTimeout>);
 await exportTickets(emptyFilters,undefined,()=>{});
 expect(db.rpc.mock.calls[0][1].p_status).toBeNull();
 const rows=messages.find(x=>x.type==='rows')!.rows!;
 expect(rows.map(row=>row[4])).toEqual(['Tiếp nhận','Đang xử lý','Đã xử lý']);
 expect(rows.slice(0,2).map(row=>row[7])).toEqual([null,null]);
 expect(click).toHaveBeenCalledOnce();expect(terminate).toHaveBeenCalledOnce();
});
