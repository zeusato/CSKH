import {describe,it,expect} from 'vitest';
import {careDateInput,careDatesForSave} from './care-log-dates';

describe('Care log date-only form',()=>{
 it('opens the Vietnam calendar day even across a UTC date boundary',()=>{
  expect(careDateInput('2026-08-11T17:00:00Z')).toBe('2026-08-12');
 });
 it('saves reception and completion at Vietnam midnight',()=>{
  expect(careDatesForSave('2026-08-12','2026-08-12')).toEqual({received_at:'2026-08-11T17:00:00.000Z',completed_at:'2026-08-11T17:00:00.000Z'});
 });
 it('retains legacy times when only other fields are edited',()=>{
  const previous={received_at:'2026-08-12T02:30:00Z',completed_at:'2026-08-12T03:30:00Z'};
  expect(careDatesForSave('2026-08-12','2026-08-12',previous)).toEqual(previous);
 });
 it('allows changing a legacy record to same-day completion and reopening it',()=>{
  const previous={received_at:'2026-08-12T02:30:00Z',completed_at:'2026-08-13T03:30:00Z'};
  expect(careDatesForSave('2026-08-12','2026-08-12',previous)).toEqual({received_at:'2026-08-11T17:00:00.000Z',completed_at:'2026-08-11T17:00:00.000Z'});
  expect(careDatesForSave('2026-08-12',null,previous).completed_at).toBeNull();
 });
});
