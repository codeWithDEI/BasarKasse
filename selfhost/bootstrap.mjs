import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {openDatabase} from './sqlite.mjs';
const path=resolve(process.env.BASAR_DATABASE||'data/basarkasse.sqlite');mkdirSync(dirname(path),{recursive:true});
const db=openDatabase(path);db.sqlite.exec('CREATE TABLE IF NOT EXISTS __basar_migrations (name TEXT PRIMARY KEY NOT NULL)');
for(const file of readdirSync(resolve('drizzle')).filter(f=>f.endsWith('.sql')).sort()){
 if(!db.sqlite.prepare('SELECT name FROM __basar_migrations WHERE name=?').get(file)){
  db.sqlite.exec('BEGIN IMMEDIATE');try{db.sqlite.exec(readFileSync(resolve('drizzle',file),'utf8'));db.sqlite.prepare('INSERT INTO __basar_migrations(name) VALUES(?)').run(file);db.sqlite.exec('COMMIT')}catch(e){db.sqlite.exec('ROLLBACK');throw e}
 }
}
globalThis.__basarDB=db;
