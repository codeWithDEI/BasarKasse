import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyRegister,loadRegister,saveRegister,confirmedRegister,registerKey,canResubmitPending} from '../lib/basar/register.ts';
const key=registerKey('');
const command={entryFormat:'euros-v2',action:'sale',operationId:'operation-123',eventId:'event-123',staffId:'cashier-123',tillId:'till-123',items:[{id:'item-123',seller:42,price:650}],received:1000,donation:50};
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

test('existing v2 register records acquire only an empty remembered identity and retain all financial recovery evidence',()=>{
 const s=storage();const record={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};
 const {lastStaffId,...legacy}=record;s.setItem(key,JSON.stringify(legacy));
 assert.deepEqual(loadRegister(s,key),{...legacy,lastStaffId:''});
});

test('tenths drafts migrate atomically once to euros while cent-valued recovery evidence stays unchanged',()=>{
 for(const [old,expected] of [['25','2,50'],['5','0,50'],['65','6,50'],['7','0,70'],['0','0,00'],['100000','10000,00'],['','']]){
  const s=storage(),pending={...command,entryFormat:'tenths-v1'},record={...emptyRegister(),priceUnit:'tenths',eventId:command.eventId,items:command.items,pending,price:old,received:'10',roundTo:'7'};
  s.setItem(key,JSON.stringify(record));let writes=0;
  const port={...s,setItem:(k:string,v:string)=>{writes++;s.setItem(k,v);}};
  const upgraded=loadRegister(port,key);assert.equal(upgraded.price,expected);assert.equal(upgraded.priceUnit,'euros');assert.deepEqual(upgraded.pending,pending);assert.deepEqual(upgraded.items,command.items);assert.equal(upgraded.received,'10');assert.equal(upgraded.roundTo,'7');
  assert.equal(upgraded.validatedPendingId,command.operationId);assert.equal(canResubmitPending(upgraded),true);
  assert.equal(loadRegister(port,key).price,expected);assert.equal(writes,1);assert.equal(JSON.parse(s.getItem(key)!).pending.operationId,command.operationId);
 }
});

test('original unmarked euro drafts retain their input without a second unit conversion',()=>{
 for(const price of ['25','6,50','0,29','25.0','']){
  const s=storage(),{priceUnit,...legacy}={...emptyRegister(),price,lastSale:receipt};s.setItem(key,JSON.stringify(legacy));
  const loaded=loadRegister(s,key);assert.equal(loaded.price,price);assert.equal(loaded.priceUnit,'euros');assert.deepEqual(loaded.lastSale,receipt);assert.equal(loadRegister(s,key).price,price);
 }
});

test('invalid tenths text is retained for review and cannot silently become a valid euro price',()=>{
 for(const price of ['2,50','25.0','-5','abc','1234567']){
  const s=storage(),record={...emptyRegister(),priceUnit:'tenths',price,eventId:command.eventId,items:command.items};s.setItem(key,JSON.stringify(record));
  const loaded=loadRegister(s,key);assert.equal(loaded.price,'');assert.equal(loaded.priceReview,price);assert.deepEqual(loaded.items,command.items);assert.deepEqual(loadRegister(s,key),loaded);
 }
});

test('failure persisting the euro-input upgrade keeps the old price and pending command intact',()=>{
 const s=storage(),legacy={...emptyRegister(),priceUnit:'tenths',price:'25',eventId:command.eventId,pending:{...command,entryFormat:'tenths-v1'},items:command.items};s.setItem(key,JSON.stringify(legacy));const original=s.getItem(key);
 assert.throws(()=>loadRegister({...s,setItem:()=>{throw new Error('QuotaExceededError')}},key),/Quota/);assert.equal(s.getItem(key),original);
});

test('unknown units fail closed without rewriting stored evidence',()=>{
 const s=storage();s.setItem(key,JSON.stringify({...emptyRegister(),priceUnit:'future-unit',price:'25'}));const original=s.getItem(key);
 assert.throws(()=>loadRegister(s,key),/Preisformat/);assert.equal(s.getItem(key),original);
});

test('an original legacy pending command gets separate provenance without changing its financial payload',()=>{
 const s=storage(),{entryFormat,...legacyCommand}=command;
 const {priceUnit,...legacy}={...emptyRegister(),eventId:command.eventId,pending:legacyCommand,items:command.items,price:'25'};
 s.setItem(key,JSON.stringify(legacy));const loaded=loadRegister(s,key);
 assert.deepEqual(loaded.pending,legacyCommand);assert.equal(loaded.validatedPendingId,command.operationId);assert.equal(canResubmitPending(loaded),true);
 assert.equal(canResubmitPending(loadRegister(s,key)),true);
});

test('obsolete or unmarked commands need original migration provenance before resubmission',()=>{
 const {entryFormat,...oldCommand}=command,record={...emptyRegister(),eventId:command.eventId,pending:oldCommand,items:command.items};
 const s=storage();saveRegister(s,key,record);assert.equal(canResubmitPending(loadRegister(s,key)),false);assert.equal(JSON.parse(s.getItem(key)!).validatedPendingId,undefined);
 assert.equal(canResubmitPending(record),false);assert.equal(canResubmitPending({...record,validatedPendingId:'other-operation'}),false);
 assert.equal(canResubmitPending({...record,pending:{...oldCommand,entryFormat:'unknown-future-version'},validatedPendingId:command.operationId}),false);
 assert.equal(canResubmitPending({...record,pending:command}),true);
 const oldTenths={...oldCommand,entryFormat:'tenths-v1'};
 assert.equal(canResubmitPending({...record,pending:oldTenths}),false);
 assert.equal(canResubmitPending({...record,pending:oldTenths,validatedPendingId:command.operationId}),true);
 const migrated=loadRegister({...s,getItem:(k:string)=>k===key?JSON.stringify({...record,priceUnit:'tenths'}):s.getItem(k)},key);assert.equal(canResubmitPending(migrated),false);
});

test('a new production installation never adopts or overwrites evaluation drafts or legacy storage',()=>{
 const s=storage(),evaluation={...emptyRegister(),eventId:command.eventId,items:command.items,pending:command};saveRegister(s,key,evaluation);s.setItem('basar-pending-v1',JSON.stringify(command));const before=new Map(s.values),productionKey=key+':production:isolated-installation';
 const production=loadRegister(s,productionKey,false);assert.deepEqual(production,emptyRegister());for(const [name,value] of before)assert.equal(s.getItem(name),value);assert.equal(loadRegister(s,key).pending?.operationId,command.operationId);
});
