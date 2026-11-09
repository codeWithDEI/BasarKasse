import {readFileSync,writeFileSync,renameSync,mkdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {backupDatabase} from './backup.mjs';
import {fileHash} from './verify.mjs';
import {backupName,pruneBackups} from './retention.mjs';
export function writeStatus(path,value){const partial=path+'.partial-'+crypto.randomUUID();writeFileSync(partial,JSON.stringify(value)+'\n',{mode:0o600});renameSync(partial,path);}
export async function snapshot(source,directory,state) {
  mkdirSync(directory,{recursive:true,mode:0o700});mkdirSync(state,{recursive:true,mode:0o700});
  const name='basar-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID()+'.sqlite';
  try {
    const output=await backupDatabase(source,join(directory,name));
    const manifest={version:1,ok:true,name,sha256:await fileHash(output),bytes:statSync(output).size,verifiedAt:new Date().toISOString()};
    writeStatus(join(directory,'latest.json'),manifest);writeStatus(join(state,'server.json'),manifest);
    pruneBackups(directory,{latest:12,hours:24,days:7});return manifest;
  } catch(error){writeStatus(join(state,'server.json'),{ok:false,failedAt:new Date().toISOString()});throw error;}
}
export async function acknowledge(manifest,directory,state) {
  if(!manifest||!backupName.test(manifest.name)||!/^[a-f0-9]{64}$/.test(manifest.sha256))throw new Error('Invalid acknowledgement.');
  const file=join(directory,manifest.name);
  if(statSync(file).size!==manifest.bytes||await fileHash(file)!==manifest.sha256)throw new Error('Acknowledgement does not match a server backup.');
  const at=Date.parse(manifest.verifiedAt);if(!Number.isFinite(at)||at>Date.now()+60000)throw new Error('Invalid backup timestamp.');
  writeStatus(join(state,'mac.json'),{...manifest,ok:true,receivedAt:new Date().toISOString()});
}
if(process.argv[2]==='snapshot')console.log(JSON.stringify(await snapshot(process.env.BASAR_DATABASE||'/data/basarkasse.sqlite','/backups','/state')));
if(process.argv[2]==='ack'){const raw=readFileSync(0,'utf8');if(raw.length>4096)throw new Error('Acknowledgement too large.');await acknowledge(JSON.parse(raw),'/backups','/state');console.log('Mac copy acknowledged.');}
