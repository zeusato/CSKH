-- Small interactive searches do not benefit from per-call LLVM compilation.
alter function public.search_tickets(text,text,uuid,uuid,uuid,uuid,timestamptz,timestamptz,text,text,jsonb,int,timestamptz) set jit='off';
alter table private.ticket_title_terms set (autovacuum_analyze_scale_factor=0.02,autovacuum_analyze_threshold=100);
analyze private.ticket_title_terms;
