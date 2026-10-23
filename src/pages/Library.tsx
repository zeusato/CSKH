import {useEffect,useState} from 'react';
import {useSearchParams} from 'react-router-dom';
import {keepPreviousData,useQuery} from '@tanstack/react-query';
import {BookOpen,Search} from 'lucide-react';
import {toast} from 'sonner';
import {getCatalogs} from '../lib/api';
import {searchLibrary} from '../lib/library-api';
import {emptyLibraryFilters,librarySourceLabels,type LibraryCursor,type LibraryFilters} from '../lib/library-types';
import {errorMessage,formatDate} from '../lib/utils';
import {Button,EmptyState,ErrorState,Field,Loading} from '../components/ui';
import LibraryDetail from '../components/LibraryDetail';
export default function Library(){
 const [params,setParams]=useSearchParams();
 const filters={...emptyLibraryFilters,...Object.fromEntries(Object.keys(emptyLibraryFilters).map(k=>[k,params.get(k)||'']))} as LibraryFilters;
 const [query,setQuery]=useState(filters.q),[cursors,setCursors]=useState<(LibraryCursor|null)[]>([null]),[page,setPage]=useState(0),[exporting,setExporting]=useState(false);
 const key=JSON.stringify(filters);
 function change(values:Partial<LibraryFilters>){setParams(p=>{for(const [k,v] of Object.entries(values)){if(v)p.set(k,v);else p.delete(k);}return p;},{replace:true});setPage(0);setCursors([null]);}
 useEffect(()=>{setQuery(filters.q);},[filters.q]);
 useEffect(()=>{if(query===filters.q)return;const timer=setTimeout(()=>change({q:query}),300);return()=>clearTimeout(timer);},[query,filters.q]);
 useEffect(()=>{setPage(0);setCursors([null]);},[key]);
 const catalogs=useQuery({queryKey:['catalogs'],queryFn:({signal})=>getCatalogs(signal),staleTime:30000});
 const result=useQuery({queryKey:['library',filters,cursors[page]],queryFn:({signal})=>searchLibrary(filters,cursors[page],signal),placeholderData:keepPreviousData,refetchInterval:30000});
 const entry=params.get('entry'),rows=result.data?.items||[];
 function select(id:string|null){setParams(p=>{if(id)p.set('entry',id);else p.delete('entry');return p;});}
 return <div className="page tickets-page"><div className="page-heading"><div className="eyebrow">KINH NGHIỆM ĐƯỢC LƯU GIỮ</div><h1>Thư viện lời giải<span className="heading-dot">.</span></h1><p>Lời giải được chủ động lưu từ ticket và nhật ký CSKH.</p></div>
 <div className="library-banner"><div className="library-banner-icon"><BookOpen size={26}/></div><div><strong>Nội dung độc lập, tra cứu lâu dài</strong><p>Xóa hoặc chỉnh sửa nguồn vẫn giữ nguyên bài và ảnh đã lưu.</p></div><div className="library-total"><strong>{result.data?.total?.toLocaleString('vi-VN')??'—'}</strong><span>bài phù hợp</span></div></div>
 <section className="panel ticket-panel" aria-label="Tra cứu thư viện"><div className="search-toolbar"><div className="search-box"><Search size={20}/><input aria-label="Tìm kiếm thư viện" placeholder="Tìm mã bài, mã nguồn, tiêu đề hoặc lời giải…" value={query} onChange={e=>setQuery(e.target.value)}/></div><Button variant="secondary" onClick={()=>result.refetch()}>Làm mới</Button><Button variant="secondary" loading={exporting} onClick={async()=>{setExporting(true);try{const {exportLibraryExcel}=await import('../lib/library-export');await exportLibraryExcel(filters);toast.success('Đã xuất thư viện');}catch(e){toast.error(errorMessage(e));}finally{setExporting(false);}}}>Xuất Excel</Button></div>
 <div className="filter-grid"><Field label="Nguồn nội dung"><select value={filters.source_type} onChange={e=>change({source_type:e.target.value})}><option value="">Tất cả nguồn</option>{Object.entries(librarySourceLabels).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></Field>
 <Field label="Hệ thống"><select value={filters.system} onChange={e=>change({system:e.target.value})}><option value="">Tất cả hệ thống</option>{catalogs.data?.systems.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
 <Field label="Phân mục"><select value={filters.category} onChange={e=>change({category:e.target.value})}><option value="">Tất cả phân mục</option>{catalogs.data?.categories.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
 <Field label="Lưu từ ngày"><input type="date" max={filters.to||undefined} value={filters.from} onChange={e=>change({from:e.target.value})}/></Field><Field label="Lưu đến hết ngày"><input type="date" min={filters.from||undefined} value={filters.to} onChange={e=>change({to:e.target.value})}/></Field><Button variant="ghost" onClick={()=>change(emptyLibraryFilters)}>Xóa bộ lọc</Button></div>
 {result.isPending?<Loading/>:result.error?<ErrorState message={errorMessage(result.error)} onRetry={()=>result.refetch()}/>:!rows.length?<EmptyState title="Chưa có bài phù hợp" description="Mở ticket đã xử lý hoặc nhật ký CSKH và chọn Lưu vào thư viện để bổ sung nội dung."/>:<div className="knowledge-list">{rows.map(e=><button className="knowledge-row" key={e.id} onClick={()=>select(e.id)}><div className="knowledge-icon"><BookOpen size={21}/></div><div className="knowledge-body"><div className="ticket-meta"><span>{e.code}</span><span>{librarySourceLabels[e.source_type]} · {e.source_code}</span><span>{e.system_name||'Chưa chọn hệ thống'}</span></div><h3>{e.title}</h3><p>{e.resolution.slice(0,320)||'Chưa ghi lời giải.'}</p><div className="knowledge-foot">Lưu {formatDate(e.created_at)}{e.category_name&&` · ${e.category_name}`}</div></div></button>)}</div>}
 <div className="table-footer"><span>{result.data?.total||0} bài · Lưu mới nhất trước</span><div className="pagination"><Button variant="secondary" disabled={!page||result.isPlaceholderData} onClick={()=>setPage(page-1)}>Trước</Button><span>Trang {page+1}</span><Button variant="secondary" disabled={!result.data?.hasMore||result.isPlaceholderData} onClick={()=>{setCursors(c=>[...c.slice(0,page+1),result.data!.nextCursor]);setPage(page+1);}}>Sau</Button></div></div></section>
 {entry&&<LibraryDetail id={entry} onClose={()=>select(null)}/>}</div>;
}
