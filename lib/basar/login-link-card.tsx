'use client';
import {useRef,useState} from 'react';
import {QRCodeCanvas} from 'qrcode.react';
import {Copy,Download,X} from 'lucide-react';

type Props={url:string;eventName:string;memberName:string;assignment:string;filename:string;onClose:()=>void};
export function LoginLinkCard({url,eventName,memberName,assignment,filename,onClose}:Props) {
  const canvas=useRef<HTMLCanvasElement>(null),[message,setMessage]=useState('');
  const copy=async()=>{
    try{await navigator.clipboard.writeText(url);setMessage('Anmeldelink kopiert.');}
    catch{setMessage('Bitte den Anmeldelink im Feld markieren und kopieren.');}
  };
  const download=()=>{
    try{
      if(!canvas.current)throw new Error('QR canvas unavailable');
      const link=document.createElement('a');link.href=canvas.current.toDataURL('image/png');link.download=filename;link.click();
      setMessage('QR-Code zum Speichern bereit.');
    }catch{setMessage('Der QR-Code konnte nicht gespeichert werden. Bitte den Anmeldelink verwenden.');}
  };
  return <section className="login-link-card" aria-label="Persönlicher Anmeldelink">
    <div className="login-link-heading"><div><h3>{memberName}</h3><p>{assignment} · {eventName}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Anmeldelink schließen"><X size={18}/></button></div>
    <QRCodeCanvas ref={canvas} className="login-qr-code" style={{width:'100%',maxWidth:256,height:'auto'}} value={url} size={320} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" role="img" aria-label={`Anmeldecode für ${memberName}, ${assignment}`}/>
    <p className="login-link-help">Mit der Kamera des vorgesehenen Tablets scannen. Basar und Name sind vorausgewählt; die persönliche PIN bleibt erforderlich.</p>
    <label className="field"><span>Anmeldelink für dieses Tablet</span><input readOnly value={url} onFocus={event=>event.target.select()}/></label>
    <div className="login-link-actions"><button type="button" className="button secondary compact" onClick={()=>void copy()}><Copy size={16}/>Link kopieren</button><button type="button" className="button secondary compact" onClick={download}><Download size={16}/>QR-Code speichern</button></div>
    <p className="fine-print">Zur Vorbereitung ohne offenen Einkauf verwenden. Vorhandene Einkäufe bleiben erhalten. Website-Daten nicht löschen.</p>
    <p className="login-link-message" role="status" aria-live="polite">{message}</p>
  </section>;
}
