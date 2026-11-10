// A browser-test server always owns a disposable database; no live URL/database is accepted.
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const directory=mkdtempSync(join(tmpdir(),'basar-browser-'));
process.env.BASAR_DATABASE=join(directory,'basar.sqlite');
process.env.BASAR_TEAM_PIN_KEY='d2'.repeat(32); // Synthetic browser fixture key.
process.env.HOSTNAME='127.0.0.1';process.env.PORT='3138';
process.env.BASAR_PUBLIC_ORIGIN='http://127.0.0.1:3138';
const {readFileSync}=await import('node:fs');
process.env.NEXT_PUBLIC_BASE_PATH=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.basePath;
process.on('exit',()=>{try{globalThis.__basarDB?.close();}finally{rmSync(directory,{recursive:true,force:true});}});
process.on('SIGTERM',()=>process.exit(0));process.on('SIGINT',()=>process.exit(0));
await import('../selfhost/start.mjs');
