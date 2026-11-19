import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {prepareProduction,activateProduction,revokeDevice,inviteDevice} from '../../selfhost/production.mjs';
import {openDatabase} from '../../selfhost/sqlite.mjs';
import {registerKey} from '../../lib/basar/register';
const basePath=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.basePath;
const syntheticPassword='Synthetic manager passphrase 2026';
async function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'basar-production-browser-')),database=join(dir,'production.sqlite'),handover=join(dir,'access.json');const listener=createServer();await new Promise<void>(r=>listener.listen(0,'127.0.0.1',r));const port=(listener.address() as {port:number}).port;await new Promise<void>(r=>listener.close(()=>r()));
 const origin='http://127.0.0.1:'+port,base=origin+basePath,api=base+'/api/basar',key='c7'.repeat(32);process.env.BASAR_TEAM_PIN_KEY=key;
 const prepared=await prepareProduction(database,{publicUrl:base,managerPassword:syntheticPassword,event:{name:'Synthetic browser production',date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:6}},handover),access=JSON.parse(readFileSync(handover,'utf8'));
 let logs='';const server=spawn(process.execPath,['selfhost/start.mjs'],{env:{...process.env,BASAR_MODE:'production',BASAR_DATABASE:database,BASAR_TEAM_PIN_KEY:key,BASAR_PUBLIC_ORIGIN:origin,NEXT_PUBLIC_BASE_PATH:basePath,HOSTNAME:'127.0.0.1',PORT:String(port)},stdio:['ignore','pipe','pipe']});for(const stream of [server.stdout,server.stderr])stream.on('data',c=>{logs=(logs+c).slice(-2000);});
 let ready=false;for(let n=0;n<150;n++){if(server.exitCode!==null)throw new Error('Synthetic server startup failed: '+logs);try{if((await fetch(api+'?view=access')).ok){ready=true;break;}}catch{}await delay(100);}if(!ready){server.kill('SIGKILL');await new Promise(r=>server.once('exit',r));rmSync(dir,{recursive:true,force:true});throw new Error('Synthetic production server did not start: '+logs);}
 const epoch=()=>{const db=openDatabase(database);try{return (db.sqlite.prepare('SELECT epoch FROM instance_state').get() as {epoch:string}).epoch;}finally{db.close();}};
 const post=async(context:BrowserContext,action:string,p:Record<string,unknown>={})=>{const r=await context.request.post(api,{headers:{Origin:origin},data:{action,eventId:access.event.id,entryFormat:'euros-v2',instanceEpoch:epoch(),operationId:crypto.randomUUID(),...p}});expect(r.status()).toBe(200);return r.json();};
 const pair=async(context:BrowserContext,index:number)=>{const code=new URLSearchParams(new URL(access.devices[index].enrolmentUrl).hash.slice(1)).get('device');await post(context,'claimDevice',{code,nonce:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')});};
 const manager=async(context:BrowserContext)=>{await pair(context,0);await post(context,'login',{staffId:access.manager.id,pin:syntheticPassword});};
 const pin=async(context:BrowserContext,index=0)=>{const r=await context.request.get(api+'?view=team&event='+access.event.id+'&revealPins=1'),state=await r.json();return state.team.find((p:{id:string})=>p.id===access.cashiers[index].id).pin as string;};
 const activate=()=>activateProduction(database,{approved:true,approvedAt:new Date().toISOString(),approvedBy:'Synthetic browser test',installationId:prepared.installationId});
 const dispose=async()=>{if(server.exitCode===null){const done=new Promise(r=>server.once('exit',r));server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),5000);await done;clearTimeout(timer);}rmSync(dir,{recursive:true,force:true});};
 return {dir,database,origin,base,api,access,prepared,post,pair,manager,pin,activate,dispose,register:registerKey(basePath)+':production:'+prepared.installationId};
}
async function cashierLogin(page:Page,pin:string){await page.locator('.profile').click();await expect(page.getByRole('combobox',{name:'Name',exact:true})).toHaveCount(0);await page.getByLabel('Persönliche PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:/^(Anmelden|Weiterarbeiten)$/}).click();await expect(page.getByRole('dialog')).toHaveCount(0);}
async function basket(page:Page){await page.getByRole('textbox',{name:'Verkäufernummer',exact:true}).fill('42');await page.getByRole('textbox',{name:'Artikelpreis',exact:true}).fill('6,50');await page.getByRole('button',{name:'Zum Einkauf hinzufügen'}).click();await page.getByRole('textbox',{name:'Aufrunden auf',exact:true}).fill('7');await page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true}).fill('10');}
async function receipt(page:Page){await expect(page.getByText('VERKAUF #0001 GESPEICHERT')).toBeVisible();await expect(page.locator('.change-box strong')).toContainText('3,00');}

test('unpaired production exposes no team/default login and device claiming survives a lost reply',async({context,page})=>{
 const f=await fixture();try{let lost=true;await page.goto(f.base);await expect(page.getByRole('heading',{name:'Dieses Gerät freischalten'})).toBeVisible();await expect(page.getByText('Übungsrollen anzeigen')).toHaveCount(0);expect((await context.request.get(f.api)).status()).toBe(403);
 const setupPage=new URL(f.access.devices[1].enrolmentUrl);setupPage.hash='';await page.goto(setupPage.href);
 await context.route('**/api/basar',async route=>{if(lost&&route.request().method()==='POST'&&route.request().postDataJSON()?.action==='claimDevice'){lost=false;const r=await route.fetch();expect(r.status()).toBe(200);await context.clearCookies({name:'basar_device'});await route.abort('failed');}else await route.continue();});
 await page.goto(f.access.devices[1].enrolmentUrl);await expect(page).not.toHaveURL(/#device=/);await page.getByRole('button',{name:'Dieses Gerät freischalten'}).click();await expect(page.locator('p.error-text[role=alert]')).toBeVisible();await page.reload();await page.getByRole('button',{name:'Dieses Gerät freischalten'}).click();await expect(page.getByRole('textbox',{name:'Artikelpreis',exact:true})).toBeVisible();expect(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('basar-device-pair:')))).toEqual([]);await expect(page.getByText(/Kassenöffnung und Buchungen starten erst nach der Freigabe/)).toBeVisible();
 }finally{await f.dispose();}
});

test('a paired register needs only its personal PIN and retains its session/draft through lock-style wake and reload',async({browser,page})=>{
 const f=await fixture(),admin=await browser.newContext();try{await f.manager(admin);const pin=await f.pin(admin);f.activate();await f.post(admin,'openTill',{number:1,opening:10000});await page.goto(f.access.devices[1].enrolmentUrl);await page.getByRole('button',{name:'Dieses Gerät freischalten'}).click();await cashierLogin(page,pin);await expect(page.getByRole('button',{name:'Verwaltung',exact:true})).toHaveCount(0);await expect(page.getByText('Übungsrollen anzeigen')).toHaveCount(0);await basket(page);await page.reload();await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(page.locator('.profile')).toContainText('Kasse 1');await expect(page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true})).toHaveValue('10');expect(await page.evaluate(()=>Object.values(localStorage).join('\n'))).not.toContain(pin);
 }finally{await admin.close();await f.dispose();}
});

test('a committed production sale with a lost reply recovers once after Wi-Fi interruption',async({browser,context,page})=>{
 const f=await fixture(),admin=await browser.newContext();try{await f.manager(admin);const pin=await f.pin(admin);f.activate();await f.post(admin,'openTill',{number:1,opening:10000});await f.pair(context,1);await page.goto(f.base);await cashierLogin(page,pin);await basket(page);let posts=0;
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){posts++;const r=await route.fetch();expect(r.status()).toBe(200);await route.abort('failed');}else await route.continue();});await page.getByRole('button',{name:'Verkauf abschließen'}).click();await expect(page.getByText(/Verbindung unterbrochen/)).toBeVisible();await context.setOffline(true);await context.setOffline(false);await page.reload();await receipt(page);expect(posts).toBe(1);const state=await (await context.request.get(f.api)).json();expect(state.sales).toHaveLength(1);
 }finally{await admin.close();await f.dispose();}
});

test('revoking/replacing a device preserves an uncertain sale and requires the original person before replay',async({browser,context,page})=>{
 const f=await fixture(),admin=await browser.newContext();try{await f.manager(admin);const pin=await f.pin(admin);f.activate();await f.post(admin,'openTill',{number:1,opening:10000});await f.pair(context,1);await page.goto(f.base);await cashierLogin(page,pin);await basket(page);let blocked=true;const ids:string[]=[];
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){ids.push(route.request().postDataJSON().operationId);if(blocked)return route.abort('failed');}await route.continue();});await page.getByRole('button',{name:'Verkauf abschließen'}).click();await expect(page.getByText(/Verbindung unterbrochen/)).toBeVisible();const id=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).pending.operationId,f.register);
 revokeDevice(f.database,f.access.devices[1].id);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.getByRole('heading',{name:'Dieses Gerät freischalten'})).toBeVisible();const invitationFile=join(f.dir,'replacement.json');await inviteDevice(f.database,{label:'Synthetic replacement register',kind:'register',eventId:f.access.event.id,tillNumber:1,publicUrl:f.base},invitationFile);const invitation=JSON.parse(readFileSync(invitationFile,'utf8'));await page.goto(invitation.enrolmentUrl);await page.getByRole('button',{name:'Dieses Gerät freischalten'}).click();await expect(page.getByRole('button',{name:'Erneut anmelden',exact:true})).toBeVisible();blocked=false;await page.getByRole('button',{name:'Erneut anmelden',exact:true}).click();await page.getByLabel('Persönliche PIN',{exact:true}).fill(pin);await page.getByRole('button',{name:'Weiterarbeiten',exact:true}).click();await receipt(page);expect(new Set(ids)).toEqual(new Set([id]));
 }finally{await admin.close();await f.dispose();}
});

test('management uses a strong password, can reveal cashier PINs, and never persists the password',async({page})=>{
 const f=await fixture();try{await page.goto(f.access.devices[0].enrolmentUrl);await page.getByRole('button',{name:'Dieses Gerät freischalten'}).click();await page.locator('.profile').click();await page.getByRole('combobox',{name:'Name',exact:true}).selectOption(f.access.manager.id);await page.getByLabel('Passwort der Kassenleitung',{exact:true}).fill(syntheticPassword);await page.getByRole('button',{name:/^(Anmelden|Weiterarbeiten)$/}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await page.getByRole('button',{name:'Verwaltung',exact:true}).click();await page.getByRole('button',{name:'PINs anzeigen',exact:true}).click();await expect(page.locator('.team-pin')).toHaveCount(6);const health=await (await page.request.get(f.base+'/api/health')).json();expect(health.mode).toBe('production');expect(health.checks.find((c:{id:string})=>c.id==='database').status).toBe('warning');expect(await page.evaluate(()=>Object.values(localStorage).join('\n')+Object.values(sessionStorage).join('\n'))).not.toContain(syntheticPassword);await page.screenshot({path:test.info().outputPath('production-prepared-management.png'),fullPage:true});
 }finally{await f.dispose();}
});
