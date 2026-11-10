import {test, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {build} from 'vite';
import {openDatabase} from '../selfhost/sqlite.mjs';

const tmp = mkdtempSync(join(tmpdir(), 'basar-concurrency-'));
await build({configFile:false, logLevel:'error', build:{
  lib:{entry:resolve('lib/basar/service.ts'), formats:['es'], fileName:()=>'service.mjs'},
  outDir:tmp, emptyOutDir:false, minify:false,
}});
const {bootstrap, mutate, readState} = await import(join(tmp, 'service.mjs'));
const {sellerSummaries, tillBalance} = await import('../lib/basar/domain.ts');
const db = openDatabase(':memory:');
globalThis.__basarDB = db;
for (const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) db.sqlite.exec(readFileSync('drizzle/'+f, 'utf8'));
await bootstrap();
const manager = {id:'demo-leitung', name:'Manager', role:'manager'};
process.env.BASAR_TEAM_PIN_KEY='c8'.repeat(32); // Synthetic test key.
const command = (action, data, user=manager) => mutate(action, {operationId:crypto.randomUUID(), ...data}, user);
after(()=>{db.close(); rmSync(tmp, {recursive:true, force:true});});

test('six synchronized registers preserve every accepted sale; conflicts require an explicit retry', async()=>{
  const {eventId} = await command('createEvent', {eventId:'demo-fruehjahr', name:'Six register contention', date:'2027-03-13', commission:1500, sellerMin:1, sellerMax:150, tillCount:6});
  const tills = [];
  for (let n=1; n<=6; n++) tills.push((await command('openTill', {eventId, number:n, opening:10000})).tillId);
  const actors=[];for(let n=1;n<=6;n++){const id=crypto.randomUUID();await command('addStaff',{eventId,operationId:id,name:'Cashier '+n,pin:'4826',role:'cashier',tillNumber:n});actors.push(db.sqlite.prepare('SELECT id,name,role,event_id,till_number,auth_version FROM staff WHERE id=?').get(id));}
  let conflicts = 0;
  for (let round=0; round<10; round++) {
    const payloads = tills.map((tillId, n)=>({eventId, tillId, operationId:crypto.randomUUID(), items:[{id:crypto.randomUUID(), seller:n+1, price:100+50*n}], donation:5, received:500}));
    const outcomes = await Promise.allSettled(payloads.map((p,n)=>mutate('sale', p, actors[n])));
    for (let n=0; n<outcomes.length; n++) {
      const result = outcomes[n];
      if (result.status==='rejected') {
        assert.equal(result.reason.status, 409);
        conflicts++;
        await mutate('sale', payloads[n], actors[n]);
      }
      const first = await mutate('sale', payloads[n], actors[n]);
      const replay = await mutate('sale', payloads[n], actors[n]);
      assert.deepEqual(first, replay);
    }
  }
  // Financial integrity check allowing explicit retries, not a no-conflict capacity gate.
  // Keep reporting conflicts even when all intended commands eventually complete.
  const state = await readState(eventId, manager);
  assert.equal(state.sales.length, 60);
  assert.equal(new Set(state.sales.map(s=>s.number)).size, 60);
  assert.equal(state.sales.reduce((sum,s)=>sum+s.total+s.donation, 0), 13800);
  for (const till of state.tills) assert.equal(tillBalance(state,till), 10000+10*(100+50*tills.indexOf(till.id)+5));
  assert.equal(db.sqlite.prepare("SELECT count(*) n FROM operations WHERE event_id=? AND action='sale'").get(eventId).n, 60);
  console.log(JSON.stringify({scenario:'six synchronized service calls, ten rounds', conflicts, committed:state.sales.length}));
});

test('concurrent seller payouts commit once and do not double-debit the pool', async()=>{
  const {eventId} = await command('createEvent', {eventId:'demo-fruehjahr', name:'Payout contention', date:'2027-03-13', commission:1500, sellerMin:1, sellerMax:150, tillCount:1});
  const {tillId} = await command('openTill', {eventId, number:1, opening:10000});
  await command('sale', {eventId, tillId, items:[{id:crypto.randomUUID(),seller:42,price:1000}], received:1000});
  await command('eventStatus', {eventId, status:'settlement'});
  await command('closeTill',{eventId,tillId,counted:11000});
  const outcomes = await Promise.allSettled(Array.from({length:6}, ()=>command('payout', {eventId, tillId, seller:42})));
  assert.equal(outcomes.filter(r=>r.status==='fulfilled').length, 1);
  const state = await readState(eventId, manager);
  assert.equal(state.payouts.length, 1);
  assert.equal(state.payouts[0].net, 850);
  assert.equal(tillBalance(state,state.tills[0]), 11000);assert.equal(state.pool.balance,10150);
  assert.equal(sellerSummaries(state)[0].payout.net, 850);
});
