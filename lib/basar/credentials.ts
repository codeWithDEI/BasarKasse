const hex=(value:ArrayBuffer|Uint8Array)=>Array.from(new Uint8Array(value),byte=>byte.toString(16).padStart(2,'0')).join('');
export const PRODUCTION_ITERATIONS=600000;
export async function digest(value:string){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
export function randomToken(){return hex(crypto.getRandomValues(new Uint8Array(32)));}
export async function hashPin(pin:string,salt:string,iterations=100000) {
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(pin),'PBKDF2',false,['deriveBits']);
 return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:new TextEncoder().encode(salt),iterations},key,256));
}
export function validProductionCredential(role:string,secret:unknown){return typeof secret==='string'&&(role==='manager'?secret.trim().length>=15&&secret.length<=128:/^\d{6,8}$/.test(secret));}
export async function productionVerifier(secret:string){const salt=crypto.randomUUID();return `pbkdf2-sha256$${PRODUCTION_ITERATIONS}$${salt}$${await hashPin(secret,salt,PRODUCTION_ITERATIONS)}`;}
const equalHash=(a:string,b:string)=>{if(a.length!==b.length)return false;let different=0;for(let i=0;i<a.length;i++)different|=a.charCodeAt(i)^b.charCodeAt(i);return different===0;};
export async function verifyCredential(secret:string,verifier:string,production=false){
 if(verifier.startsWith('pbkdf2-sha256$')){
  const [algorithm,count,salt,expected]=verifier.split('$');if(algorithm!=='pbkdf2-sha256'||Number(count)!==PRODUCTION_ITERATIONS||!salt||!/^[a-f0-9]{64}$/.test(expected||''))return false;
  return equalHash(await hashPin(secret,salt,PRODUCTION_ITERATIONS),expected);
 }
 if(production)return false;
 const [salt,expected]=verifier.split(':');return !!salt&&/^[a-f0-9]{64}$/.test(expected||'')&&equalHash(await hashPin(secret,salt),expected);
}
export async function encryptPin(pin:string,staffId:string,eventId:string,keyHex=process.env.BASAR_TEAM_PIN_KEY){
 if(!keyHex||!/^[a-f0-9]{64}$/i.test(keyHex))throw new Error('PIN_KEY_MISSING');
 const key=await crypto.subtle.importKey('raw',new Uint8Array(keyHex.match(/../g)!.map(byte=>parseInt(byte,16))),'AES-GCM',false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(staffId+':'+eventId)},key,new TextEncoder().encode(pin));
 return 'v1:'+hex(iv)+':'+btoa(String.fromCharCode(...new Uint8Array(cipher)));
}
