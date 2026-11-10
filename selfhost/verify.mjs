import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {createReadStream,statSync} from 'node:fs';
export async function fileHash(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
export function inspectDatabase(path) {
  const db=new DatabaseSync(path,{readOnly:true});
  try {
    const checks=db.prepare('PRAGMA integrity_check').all();
    if(checks.length!==1||checks[0].integrity_check!=='ok')throw new Error('SQLite integrity check failed.');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('SQLite foreign key check failed.');
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    const counts=Object.fromEntries(['events','sales','till_sessions','payouts','movements','operations','audit','pool_entries'].map(table=>[table,tables.has(table)?Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n):0]));
    const ledger={};
    if(tables.has('sales'))for(const sale of db.prepare('SELECT event_id,items,total,donation,voided_at FROM sales').iterate()) {
      const goods=JSON.parse(sale.items).reduce((sum,item)=>sum+item.price,0);
      if(!Number.isSafeInteger(goods)||goods!==sale.total)throw new Error('Receipt item sum differs from its recorded total.');
      const event=ledger[sale.event_id]??={sales:0,voids:0,goods:0,donations:0};event.sales++;
      if(sale.voided_at)event.voids++;else{event.goods+=sale.total;event.donations+=sale.donation||0;}
    }
    const pool={};
    if(tables.has('pool_entries')){
      if(db.prepare("SELECT 1 FROM pool_entries p JOIN till_sessions t ON t.id=p.till_id WHERE p.kind='till' AND (p.event_id<>t.event_id OR t.closed_at IS NULL OR p.amount<>t.counted) LIMIT 1").get())throw new Error('Counted till contribution does not match its pool entry.');
      if(db.prepare("SELECT 1 FROM till_sessions t JOIN events e ON e.id=t.event_id WHERE e.settlement_mode='pool' AND t.closed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pool_entries p WHERE p.till_id=t.id) LIMIT 1").get())throw new Error('Closed till is missing its pool contribution.');
      for(const row of db.prepare("SELECT e.id,COALESCE((SELECT SUM(amount) FROM pool_entries WHERE event_id=e.id),0) AS contributed,COALESCE((SELECT SUM(net) FROM payouts WHERE event_id=e.id AND funding='pool'),0) AS paid FROM events e WHERE e.settlement_mode='pool'").all()){if(row.contributed-row.paid<0)throw new Error('Cash pool balance is negative.');pool[row.id]={contributed:row.contributed,paid:row.paid,balance:row.contributed-row.paid};}
    }
    return {pool,integrity:'ok',bytes:statSync(path).size,counts,ledger};
  } finally {db.close();}
}
