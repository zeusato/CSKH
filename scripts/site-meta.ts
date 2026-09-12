import type { Plugin } from 'vite';

export function siteOrigin(env: Record<string,string | undefined>) {
 const configured = env.SITE_URL;
 const hostname = env.VERCEL_PROJECT_PRODUCTION_URL || env.VITE_VERCEL_PROJECT_PRODUCTION_URL || env.VERCEL_URL || env.VITE_VERCEL_URL;
 const url = new URL(configured || (hostname ? `https://${hostname}` : 'http://localhost:5173'));
 if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('SITE_URL phải là URL gốc, ví dụ https://cskh.example.com, không có đường dẫn hoặc tham số.');
 if ((env.VERCEL || env.VITE_VERCEL_ENV) && url.protocol !== 'https:') throw new Error('SITE_URL trên Vercel cần HTTPS.');
 return url.origin;
}

export function siteMetadata(env: Record<string,string | undefined>): Plugin {
 const origin = siteOrigin(env);
 return {name:'shs-site-metadata',transformIndexHtml(html){
  return html.replaceAll('__SITE_ORIGIN__',origin.replaceAll('&','&amp;').replaceAll('"','&quot;'));
 }};
}
