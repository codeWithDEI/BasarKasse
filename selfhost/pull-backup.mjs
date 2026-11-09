import {readFileSync,mkdirSync,writeFileSync,renameSync,existsSync,unlinkSync,openSync,closeSync,createWriteStream} from 'node:fs';
import {spawn,execFileSync} from 'node:child_process';
import {pipeline} from 'node:stream/promises';
import {join,resolve} from 'node:path';
import {fileHash,inspectDatabase} from './verify.mjs';
import {backupName,pruneBackups} from './retention.mjs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
for(const value of [config.remoteRoot])if(typeof value!=='string'||!/^\/[a-zA-Z0-9_./-]+$/.test(value)||value.includes('..'))throw new Error('Invalid remote directory.');
if(!/^[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+$/.test(config.host))throw new Error('Invalid SSH host.');
const directory=resolve(config.destination);mkdirSync(directory,{recursive:true,mode:0o700});
const lock=join(directory,'.pull.lock');
if(existsSync(lock)){const pid=Number(readFileSync(lock,'utf8'));let alive=false;try{process.kill(pid,0);alive=true;}catch{}if(alive)process.exit(0);unlinkSync(lock);}
const lockFd=openSync(lock,'wx',0o600);writeFileSync(lockFd,String(process.pid));closeSync(lockFd);
const args=['-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=2','-i',config.identity,config.host];
let partial;
try {
  execFileSync('/usr/bin/ssh',[...args,'sudo systemctl start basarkasse-backup.service'],{encoding:'utf8',timeout:180000,maxBuffer:4096});
  const manifest=JSON.parse(execFileSync('/usr/bin/ssh',[...args,'sudo cat -- '+config.remoteRoot+'/backups/latest.json'],{encoding:'utf8',timeout:30000,maxBuffer:4096}));
  if(!backupName.test(manifest.name)||!/^[a-f0-9]{64}$/.test(manifest.sha256)||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1)throw new Error('Invalid backup manifest.');
  const output=join(directory,manifest.name);
  if(!existsSync(output)) {
    partial=output+'.partial-'+crypto.randomUUID();
    const process=spawn('/usr/bin/ssh',[...args,'sudo cat -- '+config.remoteRoot+'/backups/'+manifest.name],{stdio:['ignore','pipe','pipe']});
    let stderr='';process.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-2000);});
    const exited=new Promise((resolve,reject)=>{process.once('error',reject);process.once('exit',code=>code===0?resolve():reject(new Error('SSH backup transfer failed: '+stderr)));});
    await Promise.all([pipeline(process.stdout,createWriteStream(partial,{flags:'wx',mode:0o600})),exited]);
    if(await fileHash(partial)!==manifest.sha256)throw new Error('Backup hash mismatch.');
    inspectDatabase(partial);for(const suffix of ['-wal','-shm'])if(existsSync(partial+suffix))unlinkSync(partial+suffix);renameSync(partial,output);partial=undefined;
  } else {if(await fileHash(output)!==manifest.sha256)throw new Error('Existing local backup has a different hash.');inspectDatabase(output);}
  execFileSync('/usr/bin/ssh',[...args,'sudo /usr/local/bin/basarkasse-backup-ack'],{input:JSON.stringify(manifest),encoding:'utf8',timeout:60000,maxBuffer:4096});
  writeFileSync(join(directory,'last-success.json'),JSON.stringify({...manifest,pulledAt:new Date().toISOString()})+'\n',{mode:0o600});
  pruneBackups(directory,{latest:12,hours:48,days:30});
  console.log(new Date().toISOString()+' Verified backup copied and acknowledged.');
} catch(error){console.error(new Date().toISOString()+' Backup pull failed: '+error.message);process.exitCode=1;}
finally{if(partial&&existsSync(partial))unlinkSync(partial);unlinkSync(lock);}
