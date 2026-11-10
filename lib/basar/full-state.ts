import {database} from './database';
import {visibleContext} from './access';
import {instanceStatus} from './queries';
import {poolFromRows} from './pool';
import type {State,Person,Till,Sale,Payout,Movement} from './domain';

export async function readState(eventId:string|undefined,user:Person|null):Promise<State> {
  const db=database(),context=await visibleContext(eventId,user),{event}=context,instance=await instanceStatus();
  if(!user)return {...context,tills:[],sales:[],payouts:[],movements:[],audit:[],user,instance};
  const cashier=user.role==='cashier',scope=cashier?' AND t.number=?':'',args=cashier?[user.till_number]:[];
  const results=await db.batch<Record<string,any>>([
    db.prepare('SELECT t.* FROM till_sessions t WHERE event_id=?'+scope+' ORDER BY opened_at DESC').bind(event.id,...args),
    db.prepare('SELECT s.* FROM sales s JOIN till_sessions t ON t.id=s.till_id WHERE s.event_id=?'+scope+' ORDER BY s.number DESC').bind(event.id,...args),
    db.prepare('SELECT * FROM payouts WHERE event_id=?'+(cashier?' AND 0':'')).bind(event.id),
    db.prepare('SELECT * FROM movements WHERE event_id=?'+(cashier?' AND 0':'')+' ORDER BY created_at DESC').bind(event.id),
    db.prepare('SELECT * FROM audit WHERE event_id=?'+(cashier?' AND 0':'')+' ORDER BY created_at DESC LIMIT 200').bind(event.id),
    db.prepare('SELECT * FROM pool_entries WHERE event_id=?'+(cashier?' AND 0':'')+' ORDER BY created_at DESC').bind(event.id),
    db.prepare("SELECT COALESCE(SUM(net),0) AS paid FROM payouts WHERE event_id=? AND funding='pool'"+(cashier?' AND 0':'')).bind(event.id),
    db.prepare('SELECT * FROM events WHERE id=?').bind(event.id),
  ]);
  return {...context,event:results[7].results[0] as State['event'],user,instance,tills:results[0].results as Till[],sales:results[1].results.map(row=>({...row,items:JSON.parse(row.items)})) as Sale[],payouts:results[2].results as Payout[],movements:results[3].results as Movement[],audit:results[4].results as State['audit'],...(!cashier?{pool:poolFromRows(results[5].results,Number(results[6].results[0].paid))}:{})};
}
