'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,LoaderCircle,LogOut} from 'lucide-react';
import type {Person} from './domain';
import {basarPath} from './paths';

type Props={
  staff:Person[]; user:Person|null; preferredStaffId:string; requiredStaffId?:string;
  onBusyChange:(busy:boolean)=>void;
  onAuthenticated:(staffId:string)=>Promise<void>;
  onLoggedOut:()=>Promise<void>;
};

export function LoginForm({staff,user,preferredStaffId,requiredStaffId,onBusyChange,onAuthenticated,onLoggedOut}:Props) {
  const [staffId,setStaffId]=useState(requiredStaffId||preferredStaffId);
  const [choosing,setChoosing]=useState(!requiredStaffId&&(!!user||!staff.some(s=>s.id===preferredStaffId)));
  const [pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pinInput=useRef<HTMLInputElement>(null),inFlight=useRef(false);
  const selected=staff.find(s=>s.id===staffId);
  const continuing=!user&&!!selected&&!choosing;
  useEffect(()=>{if(!busy&&!choosing)pinInput.current?.focus();},[busy,choosing,staffId]);

  async function submit(action:'login'|'demo'|'logout',id=staffId) {
    if(inFlight.current)return;
    if(requiredStaffId&&(id!==requiredStaffId||action!=='login'))return;
    inFlight.current=true;setBusy(true);onBusyChange(true);setError('');
    try {
      const response=await fetch(basarPath('/api/basar'),{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action,staffId:id,...(action==='login'?{pin}:{})}),
        signal:AbortSignal.timeout(12000),
      });
      const result=await response.json() as {error?:string};
      if(!response.ok)throw new Error(result.error||'Die Anmeldung konnte nicht bestätigt werden.');
      setPin('');
      if(action==='logout')await onLoggedOut();else await onAuthenticated(id);
    } catch(cause) {
      setPin('');
      setError(cause instanceof TypeError||(cause instanceof Error&&['TimeoutError','AbortError'].includes(cause.name))
        ?'Verbindung fehlt. Bitte WLAN prüfen und erneut versuchen. Dein Einkauf bleibt erhalten.'
        :cause instanceof Error?cause.message:'Bitte erneut versuchen.');
      pinInput.current?.focus();
    } finally {inFlight.current=false;setBusy(false);onBusyChange(false);}
  }

  return <>
    {requiredStaffId&&<p className="login-help">Dein offener Vorgang bleibt erhalten. Bitte mit derselben Person anmelden; danach wird das Ergebnis automatisch geprüft.</p>}
    {requiredStaffId&&!selected?<div className="notice error" role="alert"><AlertCircle size={18}/><span>Die ursprüngliche Person ist nicht verfügbar. Bitte die Kassenleitung hinzuziehen. Der offene Vorgang bleibt gesichert.</span></div>:<form onSubmit={event=>{event.preventDefault();if(selected&&/^\d{4,8}$/.test(pin))void submit('login');}}>
      {choosing?<label className="field"><span>Name</span><select autoFocus data-dialog-focus={choosing} value={staffId} disabled={busy} onChange={event=>{setStaffId(event.target.value);setPin('');setError('');if(event.target.value)setChoosing(false);}}><option value="">Name auswählen</option>{staff.map(person=><option key={person.id} value={person.id}>{person.name} · {person.role==='manager'?'Kassenleitung':'Kassiererin'}</option>)}</select></label>:<div className="login-person"><span className="avatar">{selected?.name.slice(0,1)}</span><div><strong>{selected?.name}</strong><small>{selected?.role==='manager'?'Kassenleitung':'Kassiererin'}</small></div>{!requiredStaffId&&<button className="text-button" type="button" disabled={busy} onClick={()=>{setChoosing(true);setPin('');setError('');}}>Andere Person</button>}</div>}
      <label className="field"><span>Persönliche PIN</span><input ref={pinInput} autoFocus={!choosing} data-dialog-focus={!choosing} className="login-pin" type="password" name="pin" inputMode="numeric" enterKeyHint="go" autoComplete="off" pattern="[0-9]{4,8}" minLength={4} maxLength={8} required disabled={busy||!selected} value={pin} placeholder="4–8 Ziffern" onChange={event=>setPin(event.target.value.replace(/[^0-9]/g,''))}/></label>
      {error&&<div className="notice error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <button className="button primary full login-submit" type="submit" disabled={busy||!selected||!/^\d{4,8}$/.test(pin)}>{busy?<LoaderCircle className="spin" size={20}/>:<ArrowRight size={20}/>} {busy?'Anmeldung wird geprüft …':continuing?'Weiterarbeiten':'Anmelden'}</button>
      <p className="login-help">Nach Bildschirmsperre oder WLAN-Pause bleibst du innerhalb deiner zwölfstündigen Sitzung angemeldet. Die PIN wird auf diesem Tablet nicht gespeichert.</p>
    </form>}
    {user&&!requiredStaffId&&<button className="text-button logout-button" disabled={busy} onClick={()=>void submit('logout')}><LogOut size={16}/>Abmelden</button>}
    {!user&&!requiredStaffId&&<details className="login-training"><summary>Übungsrollen anzeigen</summary><p className="login-help">Nur zum Ausprobieren. Beide Übungsrollen haben die öffentliche PIN 1234.</p><div className="demo-login-buttons">{[['demo-leitung','Übung als Kassenleitung'],['demo-kasse','Übung als Kassiererin']].map(([id,label])=><button className="button secondary" key={id} disabled={busy} onClick={()=>void submit('demo',id)}>{label}<ArrowRight size={16}/></button>)}</div></details>}
  </>;
}
