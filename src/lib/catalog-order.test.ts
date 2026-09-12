import { expect, it } from 'vitest';
import { compareCatalogItems } from './catalog-order';
it('orders the five preferred platforms first and handles case/spacing', () => {
 const names=['Nghiệp vụ DVTC','SHA APP','CORE','SH Smart WEB','SHA WEB','SH Smart APP','Khác'];
 const sorted=names.map((name,id)=>({name,id:String(id)})).sort((a,b)=>compareCatalogItems('systems',a,b));
 expect(sorted.map(x=>x.name).slice(0,5)).toEqual(['SH Smart APP','SH Smart WEB','SHA WEB','SHA APP','CORE']);
 expect(compareCatalogItems('systems',{name:' sh  SMART app ',id:'a'},{name:'CORE',id:'b'})).toBeLessThan(0);
});
