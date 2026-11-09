import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
export function migrateDatabase(db,directory=resolve('drizzle')) {
  db.sqlite.exec('CREATE TABLE IF NOT EXISTS __basar_migrations (name TEXT PRIMARY KEY NOT NULL)');
  const files=readdirSync(directory).filter(f=>f.endsWith('.sql')).sort();
  for(const row of db.sqlite.prepare('SELECT name FROM __basar_migrations').all())if(!files.includes(row.name))throw new Error('Database contains migrations unknown to this release.');
  for(const file of files)if(!db.sqlite.prepare('SELECT name FROM __basar_migrations WHERE name=?').get(file)) {
    db.sqlite.exec('BEGIN IMMEDIATE');
    try{db.sqlite.exec(readFileSync(resolve(directory,file),'utf8'));db.sqlite.prepare('INSERT INTO __basar_migrations(name) VALUES(?)').run(file);db.sqlite.exec('COMMIT');}
    catch(error){db.sqlite.exec('ROLLBACK');throw error;}
  }
}
