import {libraryWorkbook} from '../lib/library-workbook';
const report=libraryWorkbook();
self.onmessage=async event=>{try{if(event.data.type==='rows')report.add(event.data.items);if(event.data.type==='finish')self.postMessage({buffer:await report.finish()});}catch(e){self.postMessage({error:e instanceof Error?e.message:String(e)});}};
