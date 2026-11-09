import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyRegister,loadRegister,saveRegister,confirmedRegister,registerKey} from '../lib/basar/register.ts';
const key=registerKey('');
const command={action:'sale',operationId:'operation-123',eventId:'event-123',staffId:'cashier-123',tillId:'till-123',items:[{id:'item-123',seller:42,price:650}],received:1000,donation:50};
const receipt={saleId:'sale-123',number:1,total:650,donation:50,received:1000,change:300,payable:700};
const storage=()=>{const values=new Map<string,string>();return {values,getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};};
test('crash before or after the single acknowledgement write recovers either pending command or receipt, never a stale cart',()=>{
 const s=storage();const before={...emptyRegister(),eventId:command.eventId,items:command.items,received:'10',roundTo:'7',pending:command};
 saveRegister(s,key,before);
 const completed=confirmedRegister(before,command,receipt);
 assert.deepEqual(loadRegister(s,key).pending,command); // Crash before acknowledgement write.
 saveRegister(s,key,completed);
 const recovered=loadRegister(s,key);assert.equal(recovered.pending,null);assert.deepEqual(recovered.items,[]);assert.deepEqual(recovered.lastSale,receipt);
});
test('storage failure preserves the original command and receipt transition can be repeated',()=>{
 const s=storage();const before={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};saveRegister(s,key,before);
 assert.throws(()=>saveRegister({...s,setItem:()=>{throw new Error('QuotaExceededError');}},key,confirmedRegister(before,command,receipt)),/Quota/);
 assert.deepEqual(loadRegister(s,key).pending,command);
});
test('migration keeps an old uncertain sale ID and old evidence intact',()=>{
 const s=storage();s.setItem('basar-device-v1',JSON.stringify({eventId:command.eventId,tillId:'till-123'}));s.setItem('basar-draft-v1',JSON.stringify({eventId:command.eventId,items:command.items,received:'10'}));s.setItem('basar-pending-v1',JSON.stringify(command));
 const migrated=loadRegister(s,key);assert.deepEqual(migrated.pending,command);assert.deepEqual(migrated.items,command.items);assert.ok(s.getItem('basar-pending-v1'));
});
test('malformed storage fails closed rather than returning a fresh register',()=>{
 const s=storage();s.setItem(key,'{');assert.throws(()=>loadRegister(s,key));s.setItem(key,'{}');assert.throws(()=>loadRegister(s,key),/beschädigt/);
});
test('an acknowledgement for a different operation cannot clear the current command',()=>{
 assert.throws(()=>confirmedRegister({...emptyRegister(),pending:command},{...command,operationId:'another-command'},receipt),/geändert/);
});
test('a mismatched receipt cannot clear the original basket or pending command',()=>{
 const record={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};
 assert.throws(()=>confirmedRegister(record,command,{...receipt,total:700}),/stimmt nicht/);
 assert.equal(record.pending.operationId,command.operationId);assert.equal(record.items.length,1);
});
test('legacy pending sale wins over a stale previous receipt and draft',()=>{
 const s=storage();s.setItem('basar-device-v1',JSON.stringify({eventId:command.eventId}));s.setItem('basar-draft-v1',JSON.stringify({eventId:command.eventId,lastSale:receipt,items:[]}));s.setItem('basar-pending-v1',JSON.stringify(command));
 const migrated=loadRegister(s,key);assert.equal(migrated.lastSale,null);assert.deepEqual(migrated.items,command.items);assert.equal(migrated.received,'10.00');
});
