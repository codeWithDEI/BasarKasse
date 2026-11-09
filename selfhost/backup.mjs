import {DatabaseSync,backup} from 'node:sqlite';
import {resolve,dirname} from 'node:path';
import {mkdirSync,existsSync,chmodSync,linkSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {inspectDatabase} from './verify.mjs';
export async function backupDatabase(source,destination) {
  const input=resolve(source),output=resolve(destination),partial=output+'.partial-'+crypto.randomUUID();
  if(input===output)throw new Error('Backup and source must differ.');
  if(!existsSync(input))throw new Error('Source database does not exist.');
  if(existsSync(output))throw new Error('Backup destination already exists.');
  mkdirSync(dirname(output),{recursive:true,mode:0o700});
  const db=new DatabaseSync(input,{readOnly:true});
  try{await backup(db,partial);const copy=new DatabaseSync(partial);try{copy.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL;');}finally{copy.close();}chmodSync(partial,0o600);inspectDatabase(partial);linkSync(partial,output);}
  finally{db.close();if(existsSync(partial))unlinkSync(partial);}
  return output;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if(!process.argv[2])throw new Error('Specify a new backup destination.');
  console.log('Consistent, verified backup created: '+await backupDatabase(process.env.BASAR_DATABASE||'data/basarkasse.sqlite',process.argv[2]));
}
