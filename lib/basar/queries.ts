import {database} from './database';
import {sellerClaim,type State,type Person,type BasarEvent,type Sale,type Till,type Payout,type RegisterSummary} from './domain';
import {ApiError} from './operations';
import {visibleContext} from './access';
import {poolBalanceSql,poolFromRows} from './pool';

const balanceSql=`SELECT t.id,t.opening
 +COALESCE((SELECT SUM(s.total+s.donation) FROM sales s WHERE s.event_id=t.event_id AND s.till_id=t.id AND s.voided_at IS NULL),0)
 +COALESCE((SELECT SUM(m.amount) FROM movements m WHERE m.event_id=t.event_id AND m.till_id=t.id),0)
 -COALESCE((SELECT SUM(p.net) FROM payouts p WHERE p.event_id=t.event_id AND p.till_id=t.id),0) AS balance
 FROM till_sessions t WHERE t.event_id=?`;
const sellersSql=`SELECT CAST(json_extract(i.value,'$.seller') AS INTEGER) AS seller,COUNT(*) AS count,
 SUM(CAST(json_extract(i.value,'$.price') AS INTEGER)) AS gross
 FROM sales s,json_each(s.items) i WHERE s.event_id=? AND s.voided_at IS NULL`;
const parseSales=(rows:Record<string,any>[])=>rows.map(s=>({...s,items:JSON.parse(s.items)})) as Sale[];
const sellerRows=(rows:Record<string,number>[],event:BasarEvent)=>rows.map(row=>({seller:row.seller,count:row.count,gross:row.gross,...sellerClaim(row.gross,event.commission,event.settlement_mode)}));
const balances=(rows:Record<string,any>[])=>Object.fromEntries(rows.map(row=>[row.id,Number(row.balance)]));

export async function instanceStatus() {
  const state=await database().prepare('SELECT epoch,writes_paused FROM instance_state WHERE id=1').first<{epoch:string;writes_paused:number}>();
  if(!state)throw new ApiError('Die Datenbankfreigabe fehlt. Bitte die technische Leitung hinzuziehen.',503,'WRITE_PAUSED');
  return {epoch:state.epoch,writesPaused:!!state.writes_paused};
}
export async function assertWriteEpoch(command:Record<string,any>) {
  const state=await instanceStatus();
  if(state.writesPaused)throw new ApiError('Buchungen sind nach einer Wiederherstellung gesperrt. Bitte die Kassenleitung hinzuziehen.',503,'WRITE_PAUSED');
  // Pre-upgrade commands are accepted only on the original, never-restored database.
  if((command.instanceEpoch??'initial')!==state.epoch)throw new ApiError('Dieser Tablet-Vorgang stammt aus einem älteren Datenbankstand. Nicht erneut erfassen. Bitte mit der Kassenleitung abgleichen.',409,'RESTORE_REVIEW_REQUIRED');
}

export async function readRegisterState(eventId:string|undefined,user:Person|null,options:{before?:number;search?:string}={}):Promise<State> {
  const db=database(),{events,event:selected,staff}=await visibleContext(eventId,user);
  const cashier=user?.role==='cashier',scope=cashier?' AND t.number=?':'',scopeArgs=cashier?[user!.till_number]:[];
  const saleScope=cashier?' AND s.till_id IN (SELECT id FROM till_sessions WHERE event_id=? AND number=?)':'',saleScopeArgs=cashier?[selected.id,user!.till_number]:[];
  const instance=await instanceStatus();
  if(!user)return {events,event:selected,staff,user,tills:[],sales:[],payouts:[],movements:[],audit:[],instance};
  const limit=50,before=options.before??Number.MAX_SAFE_INTEGER,search=(options.search||'').trim().toLowerCase();
  const match=search?` AND (instr(CAST(s.number AS TEXT),?)>0 OR instr(lower(s.staff_name),?)>0 OR instr(CAST(t.number AS TEXT),?)>0 OR EXISTS(SELECT 1 FROM json_each(s.items) i WHERE instr(CAST(json_extract(i.value,'$.seller') AS TEXT),?)>0))`:'';
  const history=db.prepare(`SELECT s.* FROM sales s JOIN till_sessions t ON t.id=s.till_id WHERE s.event_id=? AND s.number<?${scope}${match} ORDER BY s.number DESC LIMIT ?`).bind(selected.id,before,...scopeArgs,...(search?[search,search,search,search]:[]),limit+1);
  // One atomic snapshot: event revision, financial totals, history and balances agree.
  const result=await db.batch<Record<string,any>>([
    db.prepare('SELECT * FROM events WHERE id=?').bind(selected.id),
    db.prepare('SELECT t.* FROM till_sessions t WHERE event_id=?'+scope+' ORDER BY opened_at DESC').bind(selected.id,...scopeArgs),history,
    db.prepare('SELECT * FROM payouts WHERE event_id=?'+(cashier?' AND 0':'')).bind(selected.id),
    db.prepare('SELECT * FROM audit WHERE event_id=?'+(cashier?' AND 0':'')+' ORDER BY created_at DESC LIMIT 200').bind(selected.id),
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN voided_at IS NULL THEN total ELSE 0 END),0) AS gross,
      COALESCE(SUM(CASE WHEN voided_at IS NULL THEN donation ELSE 0 END),0) AS donations,
      SUM(CASE WHEN voided_at IS NULL THEN 1 ELSE 0 END) AS count,
      SUM(CASE WHEN voided_at IS NOT NULL THEN 1 ELSE 0 END) AS voidCount,
      COALESCE(SUM(CASE WHEN voided_at IS NULL THEN json_array_length(items) ELSE 0 END),0) AS itemCount FROM sales s WHERE event_id=?${saleScope}`).bind(selected.id,...saleScopeArgs),
    db.prepare(sellersSql+(cashier?' AND 0':'')+' GROUP BY seller ORDER BY seller').bind(selected.id),db.prepare(balanceSql+scope).bind(selected.id,...scopeArgs),
    db.prepare('SELECT * FROM pool_entries WHERE event_id=?'+(cashier?' AND 0':'')+' ORDER BY created_at DESC').bind(selected.id),
    db.prepare("SELECT COALESCE(SUM(net),0) AS paid FROM payouts WHERE event_id=? AND funding='pool'"+(cashier?' AND 0':'')).bind(selected.id),
  ]);
  const event=result[0].results[0] as BasarEvent,rows=result[2].results;
  const totals=result[5].results[0];
  const summary:RegisterSummary={gross:totals.gross,donations:totals.donations,count:totals.count||0,voidCount:totals.voidCount||0,itemCount:totals.itemCount,sellers:sellerRows(result[6].results,event),tillBalances:balances(result[7].results)};
  return {events,event,staff,user,instance,...(!cashier?{pool:poolFromRows(result[8].results,Number(result[9].results[0].paid))}:{}),tills:result[1].results as Till[],sales:parseSales(rows.slice(0,limit)),payouts:result[3].results as Payout[],movements:[],audit:result[4].results as State['audit'],summary,
    salesPage:{before:options.before??null,nextBefore:rows.length>limit?Number(rows[limit-1].number):null,limit,search}};
}

/** Only the rows required to validate this command; never load event sales for a new sale. */
export async function readCommandState(action:string,p:Record<string,any>) {
  const db=database(),event=await db.prepare('SELECT * FROM events WHERE id=?').bind(typeof p.eventId==='string'?p.eventId:'').first<BasarEvent>();
  if(!event)throw new ApiError('Die Veranstaltung wurde nicht gefunden.',404);
  const id=event.id,allSellers=action==='eventStatus'&&p.status==='closed',needSellers=action==='payout'||allSellers;
  const saleId=typeof p.saleId==='string'?p.saleId:'',seller=Number.isSafeInteger(p.seller)?p.seller:0;
  const needBalance=['void','movement','payout','closeTill'].includes(action);
  const items=Array.isArray(p.items)?p.items.slice(0,300):[];
  const sellerIds=[...new Set(items.map(i=>i?.seller).filter(n=>Number.isSafeInteger(n)))];
  const payoutQuery=action==='sale'
    ?db.prepare(`SELECT * FROM payouts WHERE event_id=? AND seller IN (${sellerIds.length?sellerIds.map(()=>'?').join(','):'NULL'})`).bind(id,...sellerIds)
    :action==='void'?db.prepare(`SELECT * FROM payouts WHERE event_id=? AND seller IN (SELECT json_extract(i.value,'$.seller') FROM sales s,json_each(s.items) i WHERE s.event_id=? AND s.id=?)`).bind(id,id,saleId)
    :db.prepare('SELECT * FROM payouts WHERE event_id=?'+(allSellers?'':' AND seller=?')).bind(id,...(allSellers?[]:[seller]));
  const result=await db.batch<Record<string,any>>([
    db.prepare('SELECT * FROM till_sessions WHERE event_id=?').bind(id),
    db.prepare('SELECT * FROM sales WHERE event_id=?'+(action==='void'?' AND id=?':' LIMIT 0')).bind(id,...(action==='void'?[saleId]:[])),payoutQuery,
    db.prepare(action==='sale'?'SELECT COALESCE(MAX(number),0)+1 AS next,0 AS count FROM sales WHERE event_id=?':action==='updateEvent'?'SELECT 1 AS next,EXISTS(SELECT 1 FROM sales WHERE event_id=?) AS count':'SELECT 1 AS next,0 AS count WHERE ? IS NOT NULL').bind(id),
    db.prepare(needBalance?balanceSql:'SELECT id,0 AS balance FROM till_sessions WHERE 0 AND event_id=?').bind(id),
    db.prepare(needSellers?sellersSql+(allSellers?'':" AND CAST(json_extract(i.value,'$.seller') AS INTEGER)=?")+' GROUP BY seller ORDER BY seller':"SELECT 0 AS seller,0 AS count,0 AS gross WHERE 0 AND ? IS NOT NULL").bind(id,...(needSellers&&!allSellers?[seller]:[])),
    db.prepare(['payout','poolMovement'].includes(action)?poolBalanceSql:'SELECT 0 AS balance WHERE ? IS NOT NULL AND ? IS NOT NULL').bind(id,id),
  ]);
  return {event,pool:{balance:Number(result[6].results[0].balance)},tills:result[0].results as Till[],sales:parseSales(result[1].results),payouts:result[2].results as Payout[],movements:[],
    saleCount:Number(result[3].results[0].count),nextSaleNumber:Number(result[3].results[0].next),
    summary:{gross:0,donations:0,count:0,voidCount:0,itemCount:0,sellers:sellerRows(result[5].results,event),tillBalances:balances(result[4].results)} satisfies RegisterSummary};
}
