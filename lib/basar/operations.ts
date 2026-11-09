import {database} from './database';
import type {Person} from './domain';

export class ApiError extends Error {
  constructor(message:string, public status=400, public code='INVALID_COMMAND', public recorded=false) { super(message); }
}
type Stored = {event_id:string;staff_id:string;action:string;result:string;request_hash:string|null;outcome:string};
export type OperationStatus = {state:'not_found'} | {state:'committed';result:Record<string,unknown>} | {state:'rejected';error:string;code:string;status:number};

function canonical(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>[k,canonical(v)]));
  return value ?? null;
}
export async function requestHash(action:string, p:Record<string,any>) {
  // Do not persist a fast offline PIN verifier. Staff creation is not a durable browser command.
  if (action==='addStaff') return null;
  const fields:Record<string,string[]> = {
    sale:['tillId','items','received','donation'], openTill:['number','opening'], void:['saleId','reason'],
    movement:['tillId','amount','reason'], payout:['seller','tillId'], closeTill:['tillId','counted','note'],
    eventStatus:['status'], updateEvent:['name','date','commission','sellerMin','sellerMax','tillCount'],
    createEvent:['name','date','commission','sellerMin','sellerMax','tillCount'],
  };
  const values=Object.fromEntries((Object.hasOwn(fields,action)?fields[action]:[]).map(k=>[k,k==='donation'?(p[k]??0):p[k]]));
  if(action==='sale' && Array.isArray(p.items)) values.items=p.items.map((i:any)=>i && ({id:i.id,seller:i.seller,price:i.price}));
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(values))));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function operationStatus(action:string, p:Record<string,any>, user:Person):Promise<OperationStatus> {
  if(typeof p.operationId!=='string'||p.operationId.length<8||p.operationId.length>100) throw new ApiError('Die Vorgangskennung fehlt.');
  const row=await database().prepare('SELECT * FROM operations WHERE id=?').bind(p.operationId).first<Stored>();
  if(!row) return {state:'not_found'};
  if(row.staff_id!==user.id||row.event_id!==p.eventId||row.action!==action) throw new ApiError('Dieser Vorgang gehört zu einer anderen Person oder Veranstaltung.',409,'OPERATION_MISMATCH');
  const hash=await requestHash(action,p);
  if(row.request_hash && row.request_hash!==hash) throw new ApiError('Der gespeicherte Vorgang hat andere Buchungsdaten. Bitte die Kassenleitung hinzuziehen.',409,'OPERATION_MISMATCH');
  // Recover pre-upgrade sales against their original persisted receipt, not just an unverified result.
  if(!row.request_hash && action==='sale') {
    const result=JSON.parse(row.result);
    const sale=await database().prepare('SELECT * FROM sales WHERE id=?').bind(result.saleId).first<Record<string,any>>();
    if(!sale || await requestHash('sale',{tillId:sale.till_id,items:JSON.parse(sale.items),received:sale.received,donation:sale.donation})!==hash) throw new ApiError('Die ursprünglichen Verkaufsdaten stimmen nicht überein. Bitte die Kassenleitung hinzuziehen.',409,'OPERATION_MISMATCH');
  }
  const result=JSON.parse(row.result);
  return row.outcome==='rejected' ? {state:'rejected',...result} : {state:'committed',result};
}
export function unwrapOperation(status:OperationStatus) {
  if(status.state==='rejected') throw new ApiError(status.error,status.status,status.code,true);
  return status.state==='committed'?status.result:undefined;
}
