import {expect,it} from 'vitest';
import {siteOrigin} from '../../scripts/site-meta';
it('uses explicit custom domain, otherwise the stable Vercel production domain',()=>{
 expect(siteOrigin({SITE_URL:'https://cskh.example.com/',VERCEL_PROJECT_PRODUCTION_URL:'preview.vercel.app'})).toBe('https://cskh.example.com');
 expect(siteOrigin({VERCEL_PROJECT_PRODUCTION_URL:'workspace.vercel.app',VERCEL_URL:'random-preview.vercel.app'})).toBe('https://workspace.vercel.app');
 expect(siteOrigin({VITE_VERCEL_PROJECT_PRODUCTION_URL:'workspace.vercel.app'})).toBe('https://workspace.vercel.app');
 expect(siteOrigin({})).toBe('http://localhost:5173');
});
it('rejects credentials, route/query pollution and non-HTTPS production URLs',()=>{
 for(const SITE_URL of ['https://user:secret@example.com','https://example.com/tickets','https://example.com/?ticket=1','javascript:alert(1)','http://example.com'])expect(()=>siteOrigin({SITE_URL,VERCEL:'1'})).toThrow();
});
