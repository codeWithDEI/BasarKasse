import {runtimeHealth} from './health.mjs';
import {migrateDatabase} from './migrations.mjs';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {openDatabase} from './sqlite.mjs';
const path=resolve(process.env.BASAR_DATABASE||'data/basarkasse.sqlite');mkdirSync(dirname(path),{recursive:true});
const db=openDatabase(path);
migrateDatabase(db);
globalThis.__basarDB=db;

globalThis.__basarHealth=runtimeHealth;
