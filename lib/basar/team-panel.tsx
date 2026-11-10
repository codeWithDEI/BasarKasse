'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Users,Plus,Settings2,Eye,EyeOff,AlertCircle,X} from 'lucide-react';
import {basarPath} from './paths';
import type {BasarEvent,Person} from './domain';
import type {TeamMember} from './team';

type Props={event:BasarEvent;user:Person;command:(action:string,payload:Record<string,unknown>)=>Promise<unknown>};
export function TeamPanel({event,user,command}:Props) {
  const [team,setTeam]=useState<TeamMember[]>([]),[reveal,setReveal]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<TeamMember|null|undefined>(),[name,setName]=useState(''),[role,setRole]=useState('cashier'),[till,setTill]=useState('1'),[pin,setPin]=useState(''),[disabled,setDisabled]=useState(false),[loginLink,setLoginLink]=useState('');
  const dialog=useRef<HTMLDialogElement>(null),generation=useRef(0);
  const load=useCallback(async(showPins=false)=>{
    const request=++generation.current;
    const response=await fetch(basarPath('/api/basar')+'?'+new URLSearchParams({view:'team',event:event.id,...(showPins?{revealPins:'1'}:{})}),{cache:'no-store',signal:AbortSignal.timeout(12000)});
    const result=await response.json() as {team:TeamMember[];error?:string};if(!response.ok)throw new Error(result.error||'Das Team konnte nicht geladen werden.');
    if(!Array.isArray(result.team))throw new Error('Das Team konnte nicht gelesen werden.');
    if(request===generation.current){setTeam(result.team);setReveal(showPins);}
  },[event.id]);
  useEffect(()=>{setTeam([]);setReveal(false);void load().catch(error=>setError(error.message));},[load]);
  useEffect(()=>{if(editing!==undefined)dialog.current?.showModal();},[editing]);
  const edit=(member:TeamMember|null)=>{setError('');setEditing(member);setName(member?.name||'');setRole(member?.role||'cashier');setTill(String(member?.till_number||1));setPin('');setDisabled(!!member?.disabled);};
  const close=()=>{if(!busy){setPin('');setEditing(undefined);}};
  const save=async()=>{
    if(busy)return;setBusy(true);setError('');
    try{await command(editing?'updateStaff':'addStaff',{...(editing?{memberId:editing.id}:{}),name,role,tillNumber:role==='cashier'?Number(till):null,pin,disabled});setPin('');setEditing(undefined);await load(false);}
    catch(error){setError(error instanceof Error?error.message:'Das Team konnte nicht gespeichert werden.');}
    finally{setBusy(false);}
  };
  return <section className="card settings-card team-panel">
    <div className="section-heading"><span className="section-icon peach"><Users size={22}/></span><div><h2>Euer Kassenteam</h2><p>Nur für {event.name}.</p></div></div>
    {error&&editing===undefined&&<div className="notice error" role="alert"><AlertCircle size={17}/><span>{error}</span></div>}
    <button className="text-button" disabled={busy} onClick={()=>{if(reveal){generation.current++;setTeam(rows=>rows.map(({pin,...member})=>member));setReveal(false);}else void load(true).catch(error=>setError(error.message));}}>{reveal?<EyeOff size={16}/>:<Eye size={16}/>}PINs {reveal?'verbergen':'anzeigen'}</button>
    <div className="team-list">{team.map(member=><div key={member.id} className={member.disabled?'team-disabled':''}><span className="avatar">{member.name.slice(0,1)}</span><span><strong>{member.name}</strong><small>{member.role==='manager'?'Kassenleitung':member.event_id?'Kasse '+member.till_number:'Zuweisung erforderlich'}{member.disabled?' · deaktiviert':''}</small>{member.event_id&&<button className="text-button team-link" onClick={()=>{const url=new URL(basarPath('/'),window.location.origin);url.searchParams.set('event',event.id);url.searchParams.set('staff',member.id);setLoginLink(url.href);}}>Anmeldelink anzeigen</button>}{reveal&&<small className="team-pin">PIN: <strong>{member.pin??'Bitte neu vergeben'}</strong></small>}</span><button className="icon-button" disabled={event.status==='closed'||busy} aria-label={`${member.name} bearbeiten`} onClick={()=>edit(member)}><Settings2 size={18}/></button></div>)}</div>
    {loginLink&&<label className="field"><span>Anmeldelink für dieses Tablet</span><input readOnly value={loginLink} onFocus={event=>event.target.select()}/><small>Auf einem leeren Tablet öffnen. Name und Basar sind vorausgewählt; die PIN bleibt erforderlich.</small></label>}
    {!team.length&&<p className="fine-print">Für diesen Basar sind noch keine persönlichen Teamzugänge angelegt.</p>}
    <button className="button secondary" disabled={event.status==='closed'||busy} onClick={()=>edit(null)}><Plus size={17}/>Person hinzufügen</button>
    {editing!==undefined&&<dialog ref={dialog} className="modal" onCancel={event=>{event.preventDefault();close();}}>
      <div className="modal-head"><div><h2>{editing?'Teammitglied bearbeiten':'Person zum Team hinzufügen'}</h2><p>{event.name}</p></div><button className="icon-button" aria-label="Dialog schließen" disabled={busy} onClick={close}><X size={20}/></button></div>
      <form onSubmit={event=>{event.preventDefault();void save();}}>
        <label className="field"><span>Name</span><input autoFocus required minLength={2} maxLength={60} value={name} disabled={busy} onChange={event=>setName(event.target.value)}/></label>
        <label className="field"><span>Rolle</span><select value={role} disabled={busy} onChange={event=>setRole(event.target.value)}><option value="cashier">Kassiererin</option><option value="manager">Kassenleitung für diesen Basar</option></select></label>
        {role==='cashier'&&<label className="field"><span>Fest zugewiesene Kasse</span><select value={till} disabled={busy} onChange={event=>setTill(event.target.value)}>{Array.from({length:event.till_count},(_,i)=><option key={i+1} value={i+1}>Kasse {i+1}</option>)}</select></label>}
        <label className="field"><span>{editing?'Neue persönliche PIN (optional)':'Persönliche PIN'}</span><input aria-label={editing?'Neue persönliche PIN (optional)':'Persönliche PIN'} aria-describedby="team-pin-help" type="password" inputMode="numeric" autoComplete="new-password" required={!editing} pattern="[0-9]{4,8}" minLength={4} maxLength={8} disabled={busy} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))}/><small id="team-pin-help">{editing?'Leer lassen, um die bisherige PIN zu behalten.':'4 bis 8 Ziffern. Nur die Kassenleitung kann die PIN wieder anzeigen.'}</small></label>
        {editing&&editing.id!==user.id&&<label className="team-checkbox"><input type="checkbox" checked={disabled} disabled={busy} onChange={event=>setDisabled(event.target.checked)}/>Zugang deaktivieren</label>}
        {editing&&<p className="fine-print">Speichern beendet die laufenden Anmeldungen dieser Person. Bitte offene Einkäufe vorher klären. Buchungen und Belege bleiben erhalten.</p>}
        {error&&<div className="notice error" role="alert"><AlertCircle size={17}/><span>{error}</span></div>}
        <div className="modal-actions"><button type="button" className="button secondary" disabled={busy} onClick={close}>Abbrechen</button><button className="button primary" type="submit" disabled={busy}>{busy?'Wird gespeichert …':editing?'Änderungen speichern':'Person hinzufügen'}</button></div>
      </form>
    </dialog>}
  </section>;
}
