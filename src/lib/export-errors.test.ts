import { expect, it } from 'vitest';
import { errorMessage, isChunkLoadError } from './utils';
it('distinguishes stale export modules from database connection errors',()=>{
 const error=new TypeError('Failed to fetch dynamically imported module: https://local.test/assets/export-pdf-old.js');
 expect(isChunkLoadError(error)).toBe(true);
 expect(errorMessage(error)).toContain('phiên bản cũ');
 expect(errorMessage(new TypeError('Failed to fetch'))).toContain('Không kết nối được máy chủ');
});
