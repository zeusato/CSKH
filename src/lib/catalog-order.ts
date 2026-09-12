const platformOrder = ['sh smart app', 'sh smart web', 'sha web', 'sha app', 'core'];
export function compareCatalogItems(table: string, a: {name: string; id: string}, b: {name: string; id: string}) {
 if (table === 'systems') {
  const rank = (name: string) => { const index = platformOrder.indexOf(name.trim().toLowerCase().replace(/\s+/g, ' ')); return index < 0 ? platformOrder.length : index; };
  const difference = rank(a.name) - rank(b.name);
  if (difference) return difference;
 }
 return a.name.localeCompare(b.name, 'vi') || a.id.localeCompare(b.id);
}
