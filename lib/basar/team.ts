import {database} from './database';
import {ApiError} from './operations';
import {assertEventAccess,personColumns} from './access';
import type {Person} from './domain';
import type {BasarEvent} from './domain';
import {hashPin} from './auth';

export type TeamMember=Person&{disabled:number;pin?:string|null};
const hex=(value:Uint8Array)=>Array.from(value,byte=>byte.toString(16).padStart(2,'0')).join('');
async function pinKey() {
  const value=process.env.BASAR_TEAM_PIN_KEY;
  if(!value||!/^([a-f0-9]{2}){32}$/i.test(value))throw new ApiError('Die geschützte Teamverwaltung ist noch nicht vollständig eingerichtet. Bitte die technische Leitung hinzuziehen.',503,'PIN_KEY_MISSING');
  return crypto.subtle.importKey('raw',new Uint8Array(value.match(/../g)!.map(byte=>parseInt(byte,16))),'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptPin(pin:string,staffId:string,eventId:string) {
  const key=await pinKey(),iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(staffId+':'+eventId)},key,new TextEncoder().encode(pin));
  return 'v1:'+hex(iv)+':'+btoa(String.fromCharCode(...new Uint8Array(cipher)));
}
async function decryptPin(cipher:string,staffId:string,eventId:string) {
  const [version,nonce,value]=cipher.split(':');
  if(version!=='v1'||!/^[a-f0-9]{24}$/.test(nonce)||!value)throw new Error('Invalid PIN envelope');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(nonce.match(/../g)!.map(byte=>parseInt(byte,16))),additionalData:new TextEncoder().encode(staffId+':'+eventId)},await pinKey(),Uint8Array.from(atob(value),char=>char.charCodeAt(0)));
  return new TextDecoder().decode(plain);
}
export async function readTeam(eventId:string,user:Person,revealPins=false) {
  if(user.role!=='manager')throw new ApiError('Die Teamverwaltung ist der Kassenleitung vorbehalten.',403);
  assertEventAccess(user,eventId);
  const rows=(await database().prepare('SELECT '+personColumns+',disabled,pin_cipher FROM staff WHERE event_id=?'+(!user.event_id?" OR (event_id IS NULL AND role='cashier')":'')+' ORDER BY disabled,name').bind(eventId).all<TeamMember&{pin_cipher:string|null}>()).results;
  return Promise.all(rows.map(async row=>{
    const {pin_cipher,...member}=row;
    if(!revealPins)return member;
    let pin:string|null=null;
    if(pin_cipher&&row.event_id){try{pin=await decryptPin(pin_cipher,row.id,row.event_id);}catch{pin=null;}}
    else if(row.id==='demo-kasse')pin='1234';
    return {...member,pin};
  }));
}

export async function prepareTeamChange(action:string,p:Record<string,any>,user:Person,event:BasarEvent,operationId:string) {
  if(user.role!=='manager')throw new ApiError('Die Teamverwaltung ist der Kassenleitung vorbehalten.',403);
  if(event.status==='closed')throw new ApiError('Das Team eines abgeschlossenen Basars kann nicht verändert werden.');
  const id=action==='addStaff'?operationId:p.memberId;
  if(typeof id!=='string')throw new ApiError('Die Person fehlt.');
  const previous=action==='updateStaff'?await database().prepare('SELECT * FROM staff WHERE id=?').bind(id).first<Person&{pin_hash:string;pin_cipher:string|null;disabled:number}>():null;
  if(action==='updateStaff'&&(!previous||(previous.event_id!==event.id&&!(previous.event_id===null&&previous.role==='cashier'&&!user.event_id))))throw new ApiError('Diese Person gehört nicht zu diesem Basar.',403);
  const name=typeof p.name==='string'?p.name.trim():'';
  if(name.length<2||name.length>60)throw new ApiError('Bitte einen Namen mit 2 bis 60 Zeichen eingeben.');
  if(!['cashier','manager'].includes(p.role))throw new ApiError('Ungültige Rolle.');
  if(p.disabled!==undefined&&typeof p.disabled!=='boolean')throw new ApiError('Ungültiger Kontostatus.');
  const disabled=p.disabled===true?1:0;
  if(id===user.id&&(disabled||p.role!=='manager'))throw new ApiError('Der eigene Verwaltungszugang kann hier nicht deaktiviert oder herabgestuft werden.');
  const tillNumber=p.role==='cashier'?p.tillNumber:null;
  if(p.role==='cashier'&&(!Number.isInteger(tillNumber)||tillNumber<1||tillNumber>event.till_count))throw new ApiError('Bitte eine gültige feste Kasse zuweisen.');
  const duplicate=await database().prepare('SELECT id FROM staff WHERE event_id=? AND lower(name)=lower(?) AND disabled=0 AND id<>?').bind(event.id,name,id).first();
  if(duplicate&&!disabled)throw new ApiError('Dieser Name ist in diesem Basar bereits vergeben.');
  let pinHash=previous?.pin_hash,pinCipher=previous?.pin_cipher;
  if(!previous||p.pin){
    if(typeof p.pin!=='string'||!/^\d{4,8}$/.test(p.pin))throw new ApiError('Der PIN muss 4 bis 8 Ziffern haben.');
    pinCipher=await encryptPin(p.pin,id,event.id);
    const salt=crypto.randomUUID();pinHash=salt+':'+await hashPin(p.pin,salt);
  }
  const commands=action==='addStaff'?[{sql:'INSERT INTO staff(id,name,role,pin_hash,disabled,event_id,till_number,pin_cipher) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',params:[id,name,p.role,pinHash,disabled,event.id,tillNumber,pinCipher,event.id,operationId]}]:[
    {sql:'UPDATE staff SET name=?,role=?,pin_hash=?,disabled=?,event_id=?,till_number=?,pin_cipher=?,auth_version=auth_version+1 WHERE id=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',params:[name,p.role,pinHash,disabled,event.id,tillNumber,pinCipher,id,event.id,operationId]},
    {sql:'DELETE FROM sessions WHERE staff_id=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',params:[id,event.id,operationId]},
    {sql:'DELETE FROM login_limits WHERE id=? AND EXISTS(SELECT 1 FROM events WHERE id=? AND last_op=?)',params:['account:'+id,event.id,operationId]},
  ];
  return {commands,result:{staffId:id},detail:name+(p.role==='cashier'?' · Kasse '+tillNumber:' · Kassenleitung')+(disabled?' · deaktiviert':'')};
}
