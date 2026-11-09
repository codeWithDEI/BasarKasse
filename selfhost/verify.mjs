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
    const counts=Object.fromEntries(['events','sales','till_sessions','payouts','movements','operations','audit'].filter(t=>tables.has(t)).map(table=>[table,Number(db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n)]));
    const ledger={};
    if(tables.has('sales'))for(const sale of db.prepare('SELECT event_id,items,total,donation,voided_at FROM sales').iterate()) {
      const goods=JSON.parse(sale.items).reduce((sum,item)=>sum+item.price,0);
      if(!Number.isSafeInteger(goods)||goods!==sale.total)throw new Error('Receipt item sum differs from its recorded total.');
      const event=ledger[sale.event_id]??={sales:0,voids:0,goods:0,donations:0};event.sales++;
      if(sale.voided_at)event.voids++;else{event.goods+=sale.total;event.donations+=sale.donation||0;}
    }
    return {integrity:'ok',bytes:statSync(path).size,counts,ledger};
  } finally {db.close();}
}
