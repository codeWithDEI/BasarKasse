import {database} from './database';
import {ApiError} from './operations';
import {digest} from './credentials.ts';
import {installation,productionMode,deviceRequired} from './installation';
import {publicOrigin} from './http';
import type {Person} from './domain';
export type TrustedDevice={id:string;label:string;kind:'register'|'management';event_id:string|null;till_number:number|null;expires_at:number};
const validToken=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export async function deviceForRequest(request:Request):Promise<TrustedDevice|null>{
 if(!productionMode())return null;
 const token=request.headers.get('cookie')?.match(/(?:^|; )basar_device=([^;]+)/)?.[1];if(!validToken(token))return null;
 return database().prepare('SELECT id,label,kind,event_id,till_number,expires_at FROM trusted_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').bind(await digest(token),Date.now()).first<TrustedDevice>();
}
export async function requireDevice(request:Request){if(!deviceRequired())return null;const device=await deviceForRequest(request);if(productionMode()&&!device)throw new ApiError('Dieses Tablet muss einmal durch die Kassenleitung freigeschaltet werden.',403,'DEVICE_REQUIRED');return device;}
export function assertDevicePerson(device:TrustedDevice,user:Person){
 if((device.kind==='register'&&(user.role!=='cashier'||user.event_id!==device.event_id||user.till_number!==device.till_number))||(device.kind==='management'&&device.event_id&&user.event_id!==device.event_id))throw new ApiError('Diese Person ist auf diesem Gerät nicht freigegeben.',403,'DEVICE_SCOPE_MISMATCH');
}
export async function currentDeviceForPerson(user:Person){
 await installation();if(!deviceRequired())return;
 if(!user.device_id)throw new ApiError('Die Gerätefreigabe fehlt.',403,'DEVICE_REQUIRED');
 const device=await database().prepare('SELECT id,label,kind,event_id,till_number,expires_at FROM trusted_devices WHERE id=? AND token_hash IS NOT NULL AND revoked_at IS NULL AND expires_at>?').bind(user.device_id,Date.now()).first<TrustedDevice>();
 if(!device)throw new ApiError('Die Gerätefreigabe ist abgelaufen oder wurde gesperrt.',403,'DEVICE_REQUIRED');assertDevicePerson(device,user);
}
export async function accessState(request:Request){
 const state=await installation(),device=await deviceForRequest(request);
 return {mode:state.mode,phase:state.phase,installationId:state.installation_id,deviceRequired:deviceRequired(),device:device?{label:device.label,kind:device.kind,eventId:device.event_id,tillNumber:device.till_number}:null};
}
export async function claimDevice(request:Request,code:unknown,nonce:unknown){
 await installation();if(!productionMode())throw new ApiError('Gerätefreigabe ist nur im Produktivbetrieb verfügbar.',404);
 if(!validToken(code)||!validToken(nonce))throw new ApiError('Bitte einen gültigen Freischaltcode verwenden.',400,'INVALID_DEVICE_CODE');
 const now=Date.now(),codeHash=await digest(code),nonceHash=await digest(nonce),token=await digest('basarkasse-device-v1:'+code+':'+nonce),tokenHash=await digest(token);
 // A lost reply can retry with the same private nonce; a copied, consumed invitation cannot claim a second browser.
 const changed=await database().prepare('UPDATE trusted_devices SET token_hash=?,claim_nonce_hash=?,activated_at=COALESCE(activated_at,?) WHERE registration_hash=? AND revoked_at IS NULL AND expires_at>? AND ((token_hash IS NULL AND registration_expires_at>?) OR (claim_nonce_hash=? AND token_hash=?))').bind(tokenHash,nonceHash,now,codeHash,now,now,nonceHash,tokenHash).run();
 if(changed.meta.changes!==1)throw new ApiError('Der Freischaltcode ist abgelaufen, verbraucht oder gesperrt. Bitte die Kassenleitung hinzuziehen.',403,'DEVICE_CODE_UNAVAILABLE');
 const device=await database().prepare('SELECT id,label,kind,event_id,till_number,expires_at FROM trusted_devices WHERE token_hash=? AND revoked_at IS NULL AND expires_at>?').bind(tokenHash,Date.now()).first<TrustedDevice>();
 if(!device)throw new ApiError('Die Freigabe wurde inzwischen gesperrt.',403,'DEVICE_REQUIRED');
 const path=process.env.NEXT_PUBLIC_BASE_PATH||'/',seconds=Math.max(0,Math.floor((device.expires_at-Date.now())/1000));
 const cookie=`basar_device=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${seconds}${publicOrigin(request).startsWith('https:')?'; Secure':''}`;
 return {cookie,eventId:device.event_id};
}
