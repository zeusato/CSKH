import fs from 'node:fs/promises';
const file='src/pages/Catalogs.tsx';let text=await fs.readFile(file,'utf8');
text=text.replace('{data.isPending?<Loading/>:data.error?<ErrorState','{data.error&&data.data&&<div className="catalog-heading" role="status"><span className="muted">Chưa làm mới được danh mục. Đang hiển thị dữ liệu đã tải.</span><Button variant="secondary" onClick={()=>data.refetch()}>Thử lại</Button></div>}{data.isPending?<Loading/>:data.error&&!data.data?<ErrorState');
await fs.writeFile(file,text);
