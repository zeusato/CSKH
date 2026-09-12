import { describe, expect, it } from 'vitest';
import { emptyOrigin, normalizeOrigin, originFacts } from './ticket-origin';

describe('ticket origin', () => {
 it('clears broker fields when switching to customer and preserves account leading zeros', () => {
  const value = normalizeOrigin({ ...emptyOrigin, origin: 'customer', broker_name: 'Previous broker', broker_user: 'mg01', broker_department: 'Room', customer_name: ' Nguyễn An ', customer_account: ' 001234 ', customer_broker: ' Lan ' });
  expect(value).toEqual({ ...emptyOrigin, origin: 'customer', customer_name: 'Nguyễn An', customer_account: '001234', customer_broker: 'Lan' });
 });
 it('clears customer fields when switching to broker without requiring all details', () => {
  const value = normalizeOrigin({ ...emptyOrigin, origin: 'broker', broker_name: ' Lan ', broker_user: '  ', customer_name: 'Old customer', customer_account: '00123', customer_broker: 'Old manager' });
  expect(value).toEqual({ ...emptyOrigin, origin: 'broker', broker_name: 'Lan' });
  expect(originFacts(value)).toEqual([['Nguồn phát sinh', 'MG'], ['Tên MG', 'Lan'], ['User MG', '—'], ['Phòng MG', '—']]);
 });
 it('does not invent an origin for legacy tickets', () => {
  expect(normalizeOrigin(emptyOrigin)).toEqual(emptyOrigin);
  expect(originFacts(emptyOrigin)).toEqual([['Nguồn phát sinh', 'Chưa ghi nhận']]);
 });
});
