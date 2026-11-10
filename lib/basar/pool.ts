import type {CashPool,PoolEntry} from './domain';

export const poolBalanceSql=`SELECT
 COALESCE((SELECT SUM(amount) FROM pool_entries WHERE event_id=?),0)
 -COALESCE((SELECT SUM(net) FROM payouts WHERE event_id=? AND funding='pool'),0) AS balance`;
export function poolFromRows(rows:Record<string,any>[],paid:number):CashPool {
  const entries=rows as PoolEntry[];
  const contributed=entries.filter(row=>row.kind==='till').reduce((sum,row)=>sum+row.amount,0);
  const movements=entries.filter(row=>row.kind==='movement').reduce((sum,row)=>sum+row.amount,0);
  return {entries,contributed,movements,paid,balance:contributed+movements-paid};
}
