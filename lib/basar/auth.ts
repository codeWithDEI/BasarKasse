import {database} from './database';
import {ApiError} from './operations';
import {personColumns} from './access';
import type {Person} from './domain';

import {hashPin,verifyCredential,validProductionCredential} from './credentials.ts';
export {hashPin} from './credentials.ts';
import {installation,productionMode} from './installation';
import {requireDevice,assertDevicePerson} from './devices';
export async function bootstrap() {
  await installation();if(productionMode())return;
  const db=database();if(await db.prepare('SELECT id FROM events LIMIT 1').first())return;
  const salt=crypto.randomUUID(),hash=await hashPin('1234',salt),time=new Date().toISOString();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO events(id,name,date,commission,seller_min,seller_max,till_count,status,version,created_at,settlement_mode) VALUES(?,?,?,?,?,?,?,?,?,?,'pool')").bind('demo-fruehjahr','Frühjahrsbasar · Übung','2027-03-13',1500,1,150,3,'open',0,time),
    db.prepare('INSERT OR IGNORE INTO staff(id,name,role,pin_hash,disabled) VALUES(?,?,?,?,0)').bind('demo-leitung','Kassenleitung','manager',salt+':'+hash),
    db.prepare('INSERT OR IGNORE INTO staff(id,name,role,pin_hash,disabled,event_id,till_number) VALUES(?,?,?,?,0,?,1)').bind('demo-kasse','Kassiererin','cashier',salt+':'+hash,'demo-fruehjahr'),
    db.prepare('INSERT OR IGNORE INTO audit(id,event_id,action,detail,staff_name,created_at) VALUES(?,?,?,?,?,?)').bind('demo-created','demo-fruehjahr','Veranstaltung angelegt','Übungsbetrieb mit Verkäufernummern 1–150 und 15 % Vereinsanteil.','System',time),
  ]);
}
const token=(request:Request)=>request.headers.get('cookie')?.match(/(?:^|; )basar_session=([^;]+)/)?.[1];
export async function auth(request:Request):Promise<Person|null> {
  await installation();
  const device=await requireDevice(request);const value=token(request);if(!value)return null;
  const user=await database().prepare('SELECT '+personColumns.split(',').map(column=>'s.'+column).join(',')+' FROM sessions t JOIN staff s ON s.id=t.staff_id WHERE t.token=? AND t.expires_at>? AND s.disabled=0').bind(value,Date.now()).first<Person>();
  if(user?.role==='cashier'&&(!user.event_id||!user.till_number))return null;
  if(user&&device){const bound=await database().prepare('SELECT device_id FROM sessions WHERE token=?').bind(value).first<{device_id:string|null}>();if(bound?.device_id!==device.id)return null;assertDevicePerson(device,user);user.device_id=device.id;}
  return user;
}
export async function login(id:string,pin:string,_request:Request) {
  await installation();
  const db=database(),device=await requireDevice(_request);
  if(typeof id!=='string'||typeof pin!=='string'||(productionMode()?pin.length<1||pin.length>128:!/^\d{4,8}$/.test(pin)))throw new ApiError('Bitte einen gültigen PIN eingeben.');
  const user=await db.prepare('SELECT * FROM staff WHERE id=? AND disabled=0').bind(id).first<Person&{pin_hash:string}>();
  if(!user)throw new ApiError('Name oder PIN stimmt nicht.',401);
  if(device)assertDevicePerson(device,user);
  const limitId='account:'+id,time=Date.now();
  await db.prepare('INSERT INTO login_limits(id,attempts,window_start) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END').bind(limitId,time,time-600000,time-600000).run();
  const limit=await db.prepare('SELECT attempts FROM login_limits WHERE id=?').bind(limitId).first<{attempts:number}>();
  if(limit&&limit.attempts>10)throw new ApiError('Zu viele Anmeldeversuche. Bitte in 10 Minuten erneut versuchen.',429);

  if(productionMode()&&(id.startsWith('demo-')||!validProductionCredential(user.role,pin)))throw new ApiError('Name oder Zugangsdaten stimmen nicht.',401);
  if(!await verifyCredential(pin,user.pin_hash,productionMode()))throw new ApiError('Name oder PIN stimmt nicht.',401);
  if(user.role==='cashier'&&(!user.event_id||!user.till_number))throw new ApiError('Die Kassenleitung muss dieser Person zuerst einen Basar und eine Kasse zuweisen.',403,'SCOPE_MISMATCH');
  if(device)assertDevicePerson(device,user);
  const value=crypto.randomUUID()+crypto.randomUUID();
  const inserted=await db.prepare('INSERT INTO sessions(token,staff_id,expires_at,device_id) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM staff WHERE id=? AND auth_version=? AND disabled=0) AND (? IS NULL OR EXISTS(SELECT 1 FROM trusted_devices WHERE id=? AND revoked_at IS NULL AND expires_at>? AND token_hash IS NOT NULL))').bind(value,id,time+12*3600000,device?.id??null,id,user.auth_version??0,device?.id??null,device?.id??null,time).run();
  if(inserted.meta.changes!==1)throw new ApiError('Die Anmeldung wurde inzwischen geändert. Bitte erneut mit der aktuellen PIN anmelden.',401,'AUTH_REQUIRED');
  await db.prepare('DELETE FROM login_limits WHERE id=?').bind(limitId).run();
  return value;
}
export async function logout(request:Request) {
  const value=token(request);if(value)await database().prepare('DELETE FROM sessions WHERE token=?').bind(value).run();
}
