import {describe,it,expect} from 'vitest';
import {dateBoundary,fromLocal,localInput,processingTime} from './utils';
import {searchArgs} from './api';
import {emptyFilters} from './types';
describe('Vietnamese date boundaries',()=>{
 it('includes the complete final local day with a half-open UTC range',()=>{expect(dateBoundary('2026-09-12')).toBe('2026-09-11T17:00:00.000Z');expect(dateBoundary('2026-09-12',true)).toBe('2026-09-12T17:00:00.000Z');});
 it('handles month/year rollover and leap day',()=>{expect(dateBoundary('2024-02-29',true)).toBe('2024-02-29T17:00:00.000Z');expect(dateBoundary('2026-12-31',true)).toBe('2026-12-31T17:00:00.000Z');});
 it('round-trips ticket reception time without machine timezone dependence',()=>{expect(localInput('2026-09-11T17:30:00.000Z')).toBe('2026-09-12T00:30');expect(fromLocal('2026-09-12T00:30')).toBe('2026-09-11T17:30:00.000Z');});
 it('uses identical boundaries in list and Excel RPC arguments',()=>{const args=searchArgs({...emptyFilters,from:'2026-09-12',to:'2026-09-12',status:'resolved'});expect(args.p_from).toBe('2026-09-11T17:00:00.000Z');expect(args.p_to).toBe('2026-09-12T17:00:00.000Z');expect(args.p_status).toBe('resolved');});
 it('does not invent completion time',()=>{expect(processingTime('2026-09-12T00:00:00Z',null)).toBe('Chưa hoàn thành');});
});
