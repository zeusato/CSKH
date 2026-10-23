import type {Profile} from './types';
import {careAccess} from './care-log-types';
export type LibrarySource='ticket'|'care_log';
export const librarySourceLabels:Record<LibrarySource,string>={ticket:'Ticket',care_log:'Nhật ký CSKH'};
export type LibraryInput={title:string;description:string;resolution:string};
export type LibraryEntry=LibraryInput&{
 id:string;code:string;source_type:LibrarySource;source_id:string;source_code:string;source_version:number;
 source_received_at:string|null;source_completed_at:string|null;source_context:Record<string,string|null>;
 system_id:string|null;category_id:string|null;system_name:string|null;category_name:string|null;
 created_at:string;created_by:string|null;updated_at:string;updated_by:string|null;version:number;migrated:boolean;
};
export type LibraryAttachment={id:string;entry_id:string;name:string;mime_type:string;size:number;path:string;created_at:string;url?:string};
export type LibraryCursor={date:string;id:string};
export type LibraryFilters={q:string;source_type:string;system:string;category:string;from:string;to:string};
export const emptyLibraryFilters:LibraryFilters={q:'',source_type:'',system:'',category:'',from:'',to:''};
export function canWriteLibrary(profile:Profile|null,source:LibrarySource){
 return Boolean(profile?.active&&['admin','user'].includes(profile.role)&&(source==='ticket'||careAccess(profile)==='write'));
}
