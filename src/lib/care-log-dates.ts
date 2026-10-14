import {dateBoundary,localInput} from './utils';

export function careDateInput(value?:string){return localInput(value).slice(0,10);}

export function careDatesForSave(received:string,completed:string|null,previous?:{received_at:string;completed_at:string|null}){
 // Editing other fields must not erase times retained from older records.
 if(previous&&received===careDateInput(previous.received_at)&&completed===(previous.completed_at?careDateInput(previous.completed_at):null)){
  return {received_at:previous.received_at,completed_at:previous.completed_at};
 }
 // Save changed dates together at midnight so legacy times cannot make a
 // same-day completion precede reception.
 return {received_at:dateBoundary(received)!,completed_at:completed?dateBoundary(completed):null};
}
