-- Nullable source preserves existing tickets without inventing their origin.
alter table public.tickets
 add column origin text check (origin in ('broker','customer')),
 add column broker_name text check (length(broker_name) <= 240),
 add column broker_user text check (length(broker_user) <= 240),
 add column broker_department text check (length(broker_department) <= 240),
 add column customer_name text check (length(customer_name) <= 240),
 add column customer_account text check (length(customer_account) <= 240),
 add column customer_broker text check (length(customer_broker) <= 240),
 add constraint tickets_origin_fields_check check (
  (origin is not distinct from 'broker' or (broker_name is null and broker_user is null and broker_department is null))
  and (origin is not distinct from 'customer' or (customer_name is null and customer_account is null and customer_broker is null))
 );
comment on column public.tickets.origin is 'broker = MG; customer = Khách hàng; NULL = chưa ghi nhận (ticket cũ)';
comment on column public.tickets.customer_account is 'Số tài khoản dạng text, giữ nguyên số 0 đầu';
notify pgrst, 'reload schema';
