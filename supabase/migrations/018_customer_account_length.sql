-- Keep account numbers as text so leading zeroes are preserved.
alter table public.tickets add constraint tickets_customer_account_max_length
 check (length(customer_account) <= 10);
comment on column public.tickets.customer_account is 'Số tài khoản dạng text tối đa 10 ký tự; biểu mẫu gợi ý tiền tố 069C';
notify pgrst, 'reload schema';
