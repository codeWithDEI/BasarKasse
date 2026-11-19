import type {Item} from './domain';
import {CLIENT_ENTRY_FORMAT} from './client-version.ts';
export type PendingCommand = {action:string;operationId:string;eventId:string;staffId:string;[key:string]:any};
export type SaleReceipt={saleId:string;number:number;total:number;donation:number;received:number;change:number;payable:number};
export type RegisterRecord = {
  version:2; priceUnit:'euros'; priceReview?:string; validatedPendingId?:string; revision:number; eventId:string; tillId:string; lastStaffId:string; items:Item[];
  received:string; roundTo:string; seller:string; price:string; editing:string|null;
  lastSale:SaleReceipt|null; pending:PendingCommand|null;
};
export const emptyRegister=():RegisterRecord=>({version:2,priceUnit:'euros',revision:0,eventId:'',tillId:'',lastStaffId:'',items:[],received:'',roundTo:'',seller:'',price:'',editing:null,lastSale:null,pending:null});
export const registerKey=(basePath:string)=>'basar-register-v2:'+ (basePath||'/');
type StoragePort=Pick<Storage,'getItem'|'setItem'>;
function validate(record:RegisterRecord) {
  if(!record || record.version!==2 || !Number.isSafeInteger(record.revision) || record.revision<0 || !Array.isArray(record.items)) throw new Error('Der gespeicherte Kassenstand ist beschädigt. Bitte die Kassenleitung hinzuziehen; den Browser-Speicher nicht löschen.');
  if(record.items.length>300 || record.items.some(i=>!i || typeof i.id!=='string' || !Number.isInteger(i.seller) || !Number.isSafeInteger(i.price) || i.price<1)) throw new Error('Der gespeicherte Warenkorb ist beschädigt. Bitte die Kassenleitung hinzuziehen.');
  for(const k of ['eventId','tillId','lastStaffId','received','roundTo','seller','price'] as const) if(typeof record[k]!=='string') throw new Error('Der gespeicherte Kassenstand ist unvollständig. Bitte die Kassenleitung hinzuziehen.');
  if(record.priceUnit!=='euros')throw new Error('Das gespeicherte Preisformat ist unbekannt. Bitte die Kassenleitung hinzuziehen.');
  if(record.priceReview!==undefined&&typeof record.priceReview!=='string')throw new Error('Die gespeicherte Preiseingabe ist beschädigt. Bitte die Kassenleitung hinzuziehen.');
  if(record.pending && (!record.pending.operationId || !record.pending.action || !record.pending.staffId || !record.pending.eventId || record.pending.eventId!==record.eventId)) throw new Error('Der offene Vorgang ist unvollständig. Bitte die Kassenleitung hinzuziehen.');
  if(record.lastSale && record.items.length) throw new Error('Gespeicherter Beleg und Warenkorb widersprechen sich. Bitte die Kassenleitung hinzuziehen.');
  return record;
}
export function loadRegister(storage:StoragePort,key:string):RegisterRecord {
  const raw=storage.getItem(key);
  if(raw!==null){
    const record={lastStaffId:'',...JSON.parse(raw)};
    if(record.priceUnit===undefined||record.priceUnit==='tenths'){
      const tenths=record.priceUnit==='tenths';
      if(tenths&&typeof record.price==='string'&&record.price.trim()){
        // Only the unsubmitted input changes units. Basket cents, commands and receipts are immutable.
        if(/^\d{1,6}$/.test(record.price.trim()))record.price=(Number(record.price.trim())/10).toFixed(2).replace('.',',');
        else {record.priceReview=record.price;record.price='';} // Preserve invalid old text for explicit re-entry.
      }
      // An unmarked v2 record already used ordinary euros. Do not scale its input.
      const originalPending=record.pending&&(tenths?record.pending.entryFormat==='tenths-v1':record.pending.entryFormat===undefined);
      if(originalPending)record.validatedPendingId=record.pending.operationId;
      record.priceUnit='euros';validate(record);storage.setItem(key,JSON.stringify(record));
    }
    return validate(record);
  }
  const device=JSON.parse(storage.getItem('basar-device-v1')||'{}');
  const draft=JSON.parse(storage.getItem('basar-draft-v1')||'null');
  const pending=JSON.parse(storage.getItem('basar-pending-v1')||'null');
  if(pending?.action==='addStaff') throw new Error('Ein älterer Teamverwaltungsvorgang muss zuerst durch die Kassenleitung geprüft werden.');
  const record={...emptyRegister(),eventId:pending?.eventId||device.eventId||'',tillId:device.tillId||'',pending};
  if(draft && draft.eventId===record.eventId) Object.assign(record,{items:draft.items||[],received:draft.received||'',roundTo:draft.roundTo||'',lastSale:draft.lastSale||null});
  // A pending sale is authoritative even if old draft/receipt writes were interrupted.
  if(record.pending?.action==='sale') {
    const p=record.pending,total=p.items.reduce((sum:number,i:Item)=>sum+i.price,0);
    Object.assign(record,{items:p.items,lastSale:null,received:(p.received/100).toFixed(2),roundTo:p.donation?((total+p.donation)/100).toFixed(2):''});
  } else if(record.lastSale) Object.assign(record,{items:[],received:'',roundTo:''});
  if(record.pending)record.validatedPendingId=record.pending.operationId;
  validate(record);
  storage.setItem(key,JSON.stringify(record)); // Complete migration before adopting it; leave old evidence untouched.
  return record;
}
export function saveRegister(storage:StoragePort,key:string,record:RegisterRecord):RegisterRecord {
  validate(record);
  storage.setItem(key,JSON.stringify(record)); // One atomic browser-storage replacement, before React state changes.
  return record;
}
export function confirmedRegister(record:RegisterRecord,command:PendingCommand,result:Record<string,any>):RegisterRecord {
  if(record.pending?.operationId!==command.operationId) throw new Error('Der offene Vorgang hat sich geändert. Bitte den Status erneut prüfen.');
  let next={...record,pending:null,validatedPendingId:undefined};
  if(result.tillId) next.tillId=result.tillId;
  if(command.action==='sale') {
    const total=command.items.reduce((sum:number,item:Item)=>sum+item.price,0),donation=command.donation??0;
    if(typeof result.saleId!=='string'||!Number.isSafeInteger(result.number)||result.number<1||result.total!==total||(result.donation??0)!==donation||result.received!==command.received||result.change!==command.received-total-donation) throw new Error('Der zurückgegebene Beleg stimmt nicht mit dem offenen Einkauf überein. Bitte die Kassenleitung hinzuziehen.');
    next={...next,items:[],received:'',roundTo:'',seller:'',price:'',priceReview:undefined,editing:null,lastSale:result as SaleReceipt};
  }
  if(command.action==='createEvent') next={...next,eventId:result.eventId,tillId:'',lastSale:null,items:[],received:'',roundTo:'',seller:'',price:'',priceReview:undefined,editing:null};
  return next;
}

export function canResubmitPending(record:RegisterRecord){
  const pending=record.pending;
  return !!pending&&(pending.entryFormat===CLIENT_ENTRY_FORMAT||((pending.entryFormat===undefined||pending.entryFormat==='tenths-v1')&&record.validatedPendingId===pending.operationId));
}
