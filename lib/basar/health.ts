declare global {
  var __basarHealth:undefined|(()=>Promise<Record<string,any>>);
  var __basarMetrics:undefined|{startedAt:string;total:number;recent:{at:number;status:number;ms:number}[]};
}
export function recordApiResult(status:number,ms:number) {
  const metrics=globalThis.__basarMetrics??={startedAt:new Date().toISOString(),total:0,recent:[]};
  metrics.total++;metrics.recent.push({at:Date.now(),status,ms:Math.round(ms)});
  if(metrics.recent.length>512)metrics.recent.shift();
}
