import type { QueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';
import { compareCatalogItems } from './catalog-order';
import type { CatalogItem, CatalogName, Catalogs } from './types';

const key = ['catalogs'] as const;

async function updateCache(cache: QueryClient, table: CatalogName, row: CatalogItem, deleted = false) {
 // An older in-flight list must not overwrite the row just confirmed by the server.
 await cache.cancelQueries({ queryKey: key });
 cache.setQueryData<Catalogs>(key, current => {
  if (!current) return current;
  const items = current[table].filter(item => item.id !== row.id);
  if (!deleted) items.push(row);
  items.sort((a, b) => compareCatalogItems(table, a, b));
  return { ...current, [table]: items };
 });
 // Refresh other people's changes in the background; this is not part of saving.
 void cache.invalidateQueries({ queryKey: key });
}

export async function saveCatalog(cache: QueryClient, table: CatalogName, payload: { name: string; department_id?: string }, id?: string) {
 const started = performance.now();
 const request = id ? supabase.from(table).update(payload).eq('id', id) : supabase.from(table).insert(payload);
 const { data, error } = await request.select('*').single();
 console.debug('[catalog-write]', { table, operation: id ? 'update' : 'insert', durationMs: Math.round(performance.now() - started), ok: !error });
 if (error) throw error;
 const row = data as CatalogItem;
 await updateCache(cache, table, row);
 return row;
}

export async function deleteCatalog(cache: QueryClient, table: CatalogName, row: CatalogItem) {
 const { data, error } = await supabase.from(table).delete().eq('id', row.id).select('id').maybeSingle();
 if (error) throw error;
 if (!data) throw new Error('Không thể xóa mục này. Mục có thể đã bị xóa hoặc tài khoản không còn quyền.');
 await updateCache(cache, table, row, true);
}
