import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {build} from 'vite';
const tmp=mkdtempSync(join(tmpdir(),'basar-api-test-'));
await build({configFile:false,logLevel:'error',resolve:{alias:{'@':resolve('.')}},build:{lib:{entry:resolve('app/api/basar/route.ts'),formats:['es'],fileName:()=>'route.mjs'},outDir:tmp,emptyOutDir:false,minify:false}});
const {POST}=await import(join(tmp,'route.mjs'));
after(()=>rmSync(tmp,{recursive:true,force:true}));
const request=body=>new Request('http://localhost:3000/api/basar',{method:'POST',headers:{origin:'http://localhost:3000','content-type':'application/json'},body});
test('unexpected database errors preserve an unknown outcome with 503 and no SQL detail leak',async()=>{
 const old=process.env.BASAR_PUBLIC_ORIGIN;delete process.env.BASAR_PUBLIC_ORIGIN;
 try {
  for(const error of [new Error('SQLITE_BUSY private-sql-detail'),new SyntaxError('stored JSON detail')]) {
   globalThis.__basarDB={prepare(){throw error}};
   const response=await POST(request(JSON.stringify({action:'sale'})));assert.equal(response.status,503);
   const data=await response.json();assert.equal(data.code,'OUTCOME_UNKNOWN');assert.equal(data.recorded,false);assert.ok(!data.error.includes('detail'));
  }
 } finally {if(old!==undefined)process.env.BASAR_PUBLIC_ORIGIN=old;}
});
test('only malformed request JSON is classified as a parse error',async()=>{
 const old=process.env.BASAR_PUBLIC_ORIGIN;delete process.env.BASAR_PUBLIC_ORIGIN;
 try {const response=await POST(request('{'));assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_REQUEST');}
 finally {if(old!==undefined)process.env.BASAR_PUBLIC_ORIGIN=old;}
});
