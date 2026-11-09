import {readFile} from 'node:fs/promises';
import {statfsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const GiB=1024**3;
export function ageStatus(timestamp,now=Date.now()) {
  const age=timestamp?Math.max(0,(now-Date.parse(timestamp))/1000):Infinity;
  return {ageSeconds:Number.isFinite(age)?Math.round(age):null,status:age>600?'critical':age>360?'warning':'ok'};
}
export async function runtimeHealth() {
  const checks=[];
  const add=(id,label,status,detail,extra={})=>checks.push({id,label,status,detail,...extra});
  try{const row=globalThis.__basarDB.sqlite.prepare('SELECT writes_paused FROM instance_state WHERE id=1').get();add('database','Datenbank',!row||row.writes_paused?'critical':'ok',row?.writes_paused?'Buchungen nach Wiederherstellung gesperrt':row?'Erreichbar; Buchungen freigegeben':'Freigabe fehlt');}catch{add('database','Datenbank','critical','Datenbank nicht erreichbar');}
  let diskFreeBytes=0,diskTotalBytes=0;
  try{const disk=statfsSync(dirname(resolve(process.env.BASAR_DATABASE||'data/basarkasse.sqlite')));diskFreeBytes=disk.bavail*disk.bsize;diskTotalBytes=disk.blocks*disk.bsize;const ratio=diskFreeBytes/diskTotalBytes;add('disk','Freier Serverspeicher',diskFreeBytes<GiB||ratio<.05?'critical':diskFreeBytes<5*GiB||ratio<.1?'warning':'ok',(diskFreeBytes/GiB).toFixed(1)+' GiB frei');}catch{add('disk','Freier Serverspeicher','critical','Speicherprüfung fehlgeschlagen');}
  const directory=process.env.BASAR_OPS_STATE;
  for(const [id,label,file] of [['server-backup','Sicherung auf dem Server','server.json'],['mac-backup','Geprüfte Kopie auf dem Mac','mac.json']]) {
    try{if(!directory)throw new Error();const status=JSON.parse(await readFile(resolve(directory,file),'utf8'));const age=ageStatus(status.verifiedAt);add(id,label,status.ok===false?'critical':age.status,status.ok===false?'Letzter Versuch fehlgeschlagen':age.ageSeconds===null?'Keine gültige Sicherung bestätigt':`Vor ${Math.floor(age.ageSeconds/60)} Min. geprüft`,{...age,status:status.ok===false?'critical':age.status});}
    catch{add(id,label,'critical','Noch keine geprüfte Sicherung bestätigt',{ageSeconds:null});}
  }
  const metrics=globalThis.__basarMetrics,recent=(metrics?.recent||[]).filter(row=>row.at>Date.now()-300000),errors=recent.filter(row=>row.status>=500).length;
  const times=recent.map(row=>row.ms).sort((a,b)=>a-b),p95=times.length?times[Math.ceil(times.length*.95)-1]:null;
  add('api','Buchungs-API',errors?'critical':p95!==null&&p95>1000?'warning':'ok',errors?`${errors} Serverfehler in den letzten 5 Minuten`:p95===null?'Noch keine API-Messwerte seit Neustart':`Antwortzeit p95: ${p95} ms`);
  return {status:checks.some(c=>c.status==='critical')?'critical':checks.some(c=>c.status==='warning')?'warning':'ok',checkedAt:new Date().toISOString(),release:process.env.BASAR_REVISION||'unrecorded',uptimeSeconds:Math.floor(process.uptime()),memoryBytes:process.memoryUsage().rss,diskFreeBytes,diskTotalBytes,checks,api:{since:metrics?.startedAt||null,total:metrics?.total||0,recentRequests:recent.length,recentErrors:errors,p95Ms:p95},scope:'protected evaluation; self-hosted runtime; API figures reset at restart'};
}
