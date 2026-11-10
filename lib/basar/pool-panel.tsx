'use client';
import {Coins,Info,ArrowRight,ArrowDownLeft} from 'lucide-react';
import {money,type State} from './domain';

export function PoolPanel({state,onMove}:{state:State;onMove:()=>void}) {
  if(state.event.settlement_mode!=='pool')return null;
  const open=state.tills.filter(till=>!till.closed_at),pool=state.pool;
  return <section className="card pool-panel">
    <div className="section-heading"><span className="section-icon mint"><Coins size={22}/></span><div><h2>Gemeinsamer Auszahlungstopf</h2><p>Verkauf beenden <ArrowRight size={13}/> Kassen zählen und schließen <ArrowRight size={13}/> Verkäufer auszahlen</p></div></div>
    <div className="pool-totals"><div><span>Verfügbares Bargeld</span><strong>{money(pool?.balance??0)}</strong></div><div><span>Gezählt übernommen</span><strong>{money(pool?.contributed??0)}</strong></div><div><span>Bereits ausgezahlt</span><strong>{money(pool?.paid??0)}</strong></div><div><span>Einlagen / Entnahmen</span><strong>{money(pool?.movements??0)}</strong></div></div>
    {open.length>0&&<div className="notice info"><Info size={18}/><span>Noch {open.length} {open.length===1?'Kasse muss':'Kassen müssen'} gezählt und geschlossen werden. Erst danach sind Auszahlungen möglich.</span></div>}
    <p className="fine-print">Der gesamte gezählte Kasseninhalt einschließlich Anfangswechselgeld wird genau einmal übernommen. Rückgabe von Wechselgeld als Entnahme dokumentieren. Verkäuferauszahlungen werden auf volle 10 Cent abgerundet; der Rest bleibt dem Basar.</p>
    <button className="button secondary compact" disabled={state.event.status!=='settlement'||open.length>0} onClick={onMove}><ArrowDownLeft size={17}/>Einlage / Entnahme aus Topf</button>
    {!!pool?.entries.length&&<details><summary>Übergaben und Geldbewegungen</summary><div className="table-scroll"><table><thead><tr><th>VORGANG</th><th>BETRAG</th><th>PERSON</th></tr></thead><tbody>{pool.entries.map(entry=><tr key={entry.id}><td>{entry.kind==='till'?`Kasse ${state.tills.find(till=>till.id===entry.till_id)?.number} gezählt`:entry.reason}</td><td>{money(entry.amount)}</td><td>{entry.staff_name}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
