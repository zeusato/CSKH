import * as Dialog from '@radix-ui/react-dialog';
import { X,LoaderCircle,Inbox,AlertCircle,SearchX } from 'lucide-react';
import type { ButtonHTMLAttributes,ReactNode } from 'react';
import { cn } from '../lib/utils';
import { statuses,type Status } from '../lib/types';
export function Button({variant='primary',className,loading,children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost'|'danger';loading?:boolean}){
 return <button className={cn('button',`button-${variant}`,className)} {...props} disabled={props.disabled||loading}>{loading&&<LoaderCircle size={17} className="spin"/>}{children}</button>;
}
export function Badge({status}:{status:Status}){return <span className={`status status-${status}`}><span className="status-dot"/>{statuses[status]}</span>;}
export function Modal({open,onClose,title,description,children,wide=false}:{open:boolean;onClose:()=>void;title:string;description?:string;children:ReactNode;wide?:boolean}){
 return <Dialog.Root open={open} onOpenChange={v=>{if(!v)onClose();}}><Dialog.Portal><Dialog.Overlay className="modal-overlay"/><Dialog.Content className={cn('modal',wide&&'modal-wide')} onPointerDownOutside={e=>e.preventDefault()} aria-describedby={description?'modal-description':undefined}><div className="modal-heading"><div><Dialog.Title>{title}</Dialog.Title>{description&&<Dialog.Description id="modal-description">{description}</Dialog.Description>}</div><Dialog.Close asChild><Button variant="ghost" className="icon-button" aria-label="Đóng"><X size={20}/></Button></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function Field({label,required,children,hint}:{label:string;required?:boolean;children:ReactNode;hint?:string}){return <label className="field"><span>{label}{required&&<span className="required"> *</span>}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function EmptyState({title,description,action,search=false}:{title:string;description:string;action?:ReactNode;search?:boolean}){const Icon=search?SearchX:Inbox;return <div className="empty-state"><div className="empty-icon"><Icon size={32} strokeWidth={1.5}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function ErrorState({message,onRetry}:{message:string;onRetry?:()=>void}){return <div className="error-state" role="alert"><AlertCircle size={22}/><div><strong>Chưa thể tải dữ liệu</strong><p>{message}</p>{onRetry&&<Button variant="secondary" onClick={onRetry}>Thử lại</Button>}</div></div>;}
export function Loading({label='Đang tải dữ liệu…'}:{label?:string}){return <div className="loading" role="status"><LoaderCircle className="spin" size={24}/><span>{label}</span></div>;}
export function Confirm({open,title,description,onClose,onConfirm,loading}:{open:boolean;title:string;description:string;onClose:()=>void;onConfirm:()=>void;loading?:boolean}){return <Modal open={open} onClose={onClose} title={title} description={description}><div className="modal-actions"><Button variant="secondary" onClick={onClose}>Giữ lại</Button><Button variant="danger" onClick={onConfirm} loading={loading}>Xác nhận xóa</Button></div></Modal>;}
