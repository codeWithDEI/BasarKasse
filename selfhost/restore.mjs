import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {backupDatabase} from './backup.mjs';
import {inspectDatabase} from './verify.mjs';
import {openDatabase} from './sqlite.mjs';
import {migrateDatabase} from './migrations.mjs';
export async function restoreDatabase(source,destination) {
  const original=inspectDatabase(source);await backupDatabase(source,destination);
  const db=openDatabase(destination),epoch=crypto.randomUUID();
  try{migrateDatabase(db);db.sqlite.exec('BEGIN IMMEDIATE');try{db.sqlite.prepare('UPDATE instance_state SET epoch=?,writes_paused=1 WHERE id=1').run(epoch);db.sqlite.exec('DELETE FROM sessions; DELETE FROM login_limits; COMMIT');}catch(error){db.sqlite.exec('ROLLBACK');throw error;}db.sqlite.exec('PRAGMA wal_checkpoint(TRUNCATE)');}finally{db.close();}
  const restored=inspectDatabase(destination);
  if(JSON.stringify(original.counts)!==JSON.stringify(restored.counts)||JSON.stringify(original.ledger)!==JSON.stringify(restored.ledger))throw new Error('Restored financial evidence differs from the backup. Keep all tills blocked.');
  return {epoch,writesPaused:true,report:restored};
}
export function releaseRestoredDatabase(path,epoch) {
  const db=openDatabase(path);
  try{if(db.sqlite.prepare('UPDATE instance_state SET writes_paused=0 WHERE id=1 AND epoch=? AND writes_paused=1').run(epoch).changes!==1)throw new Error('Restored instance or reconciliation acknowledgement does not match.');}finally{db.close();}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url) {
  if(process.argv[2]==='release') {
    if(process.argv[4]!=='--after-reconciliation'||!process.argv[5])throw new Error('Explicit completed reconciliation and the restored epoch are required.');
    releaseRestoredDatabase(process.argv[3],process.argv[5]);console.log('Restored database released. Old tablet commands remain fenced.');
  } else {
    if(!process.argv[2]||!process.argv[3])throw new Error('Usage: node selfhost/restore.mjs BACKUP NEW-DATABASE');
    console.log(JSON.stringify(await restoreDatabase(process.argv[2],process.argv[3]),null,2));
  }
}
