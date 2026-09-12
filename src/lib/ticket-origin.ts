export type TicketOrigin = {
 origin: 'broker' | 'customer' | null;
 broker_name: string | null;
 broker_user: string | null;
 broker_department: string | null;
 customer_name: string | null;
 customer_account: string | null;
 customer_broker: string | null;
};

export const originLabels = { broker: 'MG', customer: 'Khách hàng' };
export const emptyOrigin: TicketOrigin = { origin: null, broker_name: null, broker_user: null, broker_department: null, customer_name: null, customer_account: null, customer_broker: null };
export const originColumns = 'origin,broker_name,broker_user,broker_department,customer_name,customer_account,customer_broker';
export function normalizeOrigin(value: TicketOrigin): TicketOrigin {
 const text = (value: string | null) => value?.trim() || null;
 return { ...emptyOrigin, origin: value.origin,
  ...(value.origin === 'broker' ? { broker_name: text(value.broker_name), broker_user: text(value.broker_user), broker_department: text(value.broker_department) } : {}),
  ...(value.origin === 'customer' ? { customer_name: text(value.customer_name), customer_account: text(value.customer_account), customer_broker: text(value.customer_broker) } : {}),
 };
}
export function originFacts(value: TicketOrigin): [string, string][] {
 return [
  ['Nguồn phát sinh', value.origin ? originLabels[value.origin] : 'Chưa ghi nhận'],
  ...(value.origin === 'broker' ? [['Tên MG', value.broker_name || '—'], ['User MG', value.broker_user || '—'], ['Phòng MG', value.broker_department || '—']] as [string, string][] : []),
  ...(value.origin === 'customer' ? [['Tên KH', value.customer_name || '—'], ['Số TK', value.customer_account || '—'], ['MG QL', value.customer_broker || '—']] as [string, string][] : []),
 ];
}
