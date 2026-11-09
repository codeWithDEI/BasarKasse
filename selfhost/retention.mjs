import {readdirSync,statSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
export const backupName=/^basar-[0-9TZ-]+-[a-f0-9-]{36}\.sqlite$/;
export function retainedBackups(entries,{latest=12,hours=48,days=30}={}) {
  const sorted=[...entries].sort((a,b)=>b.time-a.time),keep=new Set(sorted.slice(0,latest).map(e=>e.name));
  for(const [bucket,limit] of [[3600000,hours],[86400000,days]]){const buckets=new Set();for(const e of sorted){const key=Math.floor(e.time/bucket);if(!buckets.has(key)&&buckets.size<limit){buckets.add(key);keep.add(e.name);}}}
  return keep;
}
export function pruneBackups(directory,options) {
  const entries=readdirSync(directory).filter(name=>backupName.test(name)).map(name=>({name,time:statSync(join(directory,name)).mtimeMs}));
  const keep=retainedBackups(entries,options);for(const e of entries)if(!keep.has(e.name))unlinkSync(join(directory,e.name));
}
