import {useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {BookOpen} from 'lucide-react';
import {toast} from 'sonner';
import {findLibraryEntry,saveToLibrary} from '../lib/library-api';
import type {LibraryInput,LibrarySource} from '../lib/library-types';
import {Button} from './ui';
import LibraryForm from './LibraryForm';
export default function SaveToLibrary({source,id,version,initial,code,eligible=true}:{source:LibrarySource;id:string;version:number;initial:LibraryInput;code:string;eligible?:boolean}){
 const [open,setOpen]=useState(false),cache=useQueryClient(),navigate=useNavigate();
 const existing=useQuery({queryKey:['library-source',source,id],queryFn:({signal})=>findLibraryEntry(source,id,signal)});
 if(!eligible&&!existing.data)return null;
 return <><Button variant="secondary" disabled={existing.isPending} onClick={()=>existing.data?navigate(`/library?entry=${existing.data}`):setOpen(true)}><BookOpen size={17}/>{existing.data?'Xem trong thư viện':'Lưu vào thư viện'}</Button>
 {open&&<LibraryForm initial={initial} sourceLabel={code} onClose={()=>setOpen(false)} onSave={async input=>{const entryId=await saveToLibrary(source,id,version,input);cache.setQueryData(['library-source',source,id],entryId);void cache.invalidateQueries({queryKey:['library']});setOpen(false);toast.success('Nội dung đã được lưu độc lập trong thư viện');}}/>}</>;
}
