'use client';
import {useEffect,useRef,useState} from 'react';
import {AlertCircle,ArrowRight,LoaderCircle,LogOut} from 'lucide-react';
import type {Person} from './domain';
import {basarPath} from './paths';

type Props={
  production?:boolean; staff:Person[]; user:Person|null; preferredStaffId:string; requiredStaffId?:string;
  onBusyChange:(busy:boolean)=>void;
  onAuthenticated:(staffId:string,eventId?:string)=>Promise<void>;
  onLoggedOut:()=>Promise<void>;
};

export function LoginForm({production=false,staff,user,preferredStaffId,requiredStaffId,onBusyChange,onAuthenticated,onLoggedOut}:Props) {
  const initialStaffId=preferredStaffId||(production&&staff.length===1?staff[0].id:'');
  const [staffId,setStaffId]=useState(requiredStaffId||initialStaffId);
  const [choosing,setChoosing]=useState(!requiredStaffId&&(!!user||!staff.some(s=>s.id===initialStaffId)));
  const [pin,setPin]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pinInput=useRef<HTMLInputElement>(null),inFlight=useRef(false);
  const selected=staff.find(s=>s.id===staffId);
  const managerSecret=production&&selected?.role==='manager',minimum=managerSecret?15:production?6:4,maximum=managerSecret?128:8,validSecret=managerSecret?pin.trim().length>=15&&pin.length<=128:new RegExp('^\\d{'+minimum+',8}$').test(pin);
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
      const result=await response.json() as {error?:string;eventId?:string};
      if(!response.ok)throw new Error(result.error||'Die Anmeldung konnte nicht bestätigt werden.');
      setPin('');
      if(action==='logout')await onLoggedOut();else await onAuthenticated(id,result.eventId);
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
    {requiredStaffId&&!selected?<div className="notice error" role="alert"><AlertCircle size={18}/><span>Die ursprüngliche Person ist nicht verfügbar. Bitte die Kassenleitung hinzuziehen. Der offene Vorgang bleibt gesichert.</span></div>:<form onSubmit={event=>{event.preventDefault();if(selected&&validSecret)void submit('login');}}>
      {choosing?<label className="field"><span>Name</span><select autoFocus data-dialog-focus={choosing} value={staffId} disabled={busy} onChange={event=>{setStaffId(event.target.value);setPin('');setError('');if(event.target.value)setChoosing(false);}}><option value="">Name auswählen</option>{staff.map(person=><option key={person.id} value={person.id}>{person.name} · {person.role==='manager'?'Kassenleitung':'Kassiererin'}</option>)}</select></label>:<div className="login-person"><span className="avatar">{selected?.name.slice(0,1)}</span><div><strong>{selected?.name}</strong><small>{selected?.role==='manager'?'Kassenleitung':'Kassiererin'}</small></div>{!requiredStaffId&&<button className="text-button" type="button" disabled={busy} onClick={()=>{setChoosing(true);setPin('');setError('');}}>Andere Person</button>}</div>}
      <label className="field"><span>{managerSecret?'Passwort der Kassenleitung':'Persönliche PIN'}</span><input ref={pinInput} autoFocus={!choosing} data-dialog-focus={!choosing} className="login-pin" type="password" name="pin" inputMode={managerSecret?'text':'numeric'} enterKeyHint="go" autoComplete="off" pattern={managerSecret?undefined:'[0-9]{'+minimum+',8}'} minLength={minimum} maxLength={maximum} required disabled={busy||!selected} value={pin} placeholder={managerSecret?'Persönliches Passwort':minimum+'–8 Ziffern'} onChange={event=>setPin(managerSecret?event.target.value:event.target.value.replace(/[^0-9]/g,''))}/></label>
      {error&&<div className="notice error" role="alert"><AlertCircle size={18}/><span>{error}</span></div>}
      <button className="button primary full login-submit" type="submit" disabled={busy||!selected||!validSecret}>{busy?<LoaderCircle className="spin" size={20}/>:<ArrowRight size={20}/>} {busy?'Anmeldung wird geprüft …':continuing?'Weiterarbeiten':'Anmelden'}</button>
      <p className="login-help">Nach Bildschirmsperre oder WLAN-Pause bleibst du innerhalb deiner zwölfstündigen Sitzung angemeldet. Die Zugangsdaten werden auf diesem Tablet nicht gespeichert.</p>
    </form>}
    {user&&!requiredStaffId&&<button className="text-button logout-button" disabled={busy} onClick={()=>void submit('logout')}><LogOut size={16}/>Abmelden</button>}
    {!production&&!user&&!requiredStaffId&&<details className="login-training"><summary>Übungsrollen anzeigen</summary><p className="login-help">Nur zum Ausprobieren. Beide Übungsrollen haben die öffentliche PIN 1234.</p><div className="demo-login-buttons">{[['demo-leitung','Übung als Kassenleitung'],['demo-kasse','Übung als Kassiererin']].map(([id,label])=><button className="button secondary" key={id} disabled={busy} onClick={()=>void submit('demo',id)}>{label}<ArrowRight size={16}/></button>)}</div></details>}
  </>;
}
