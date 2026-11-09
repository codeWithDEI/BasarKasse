import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {emptyRegister,registerKey} from '../../lib/basar/register';
import {readFileSync} from 'node:fs';
const basePath=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.basePath;
const key=registerKey(basePath),origin='http://127.0.0.1:3138',api=origin+basePath+'/api/basar';
async function setup(context:BrowserContext,page:Page) {
 const post=async(action:string,p:Record<string,unknown>={})=>{const r=await context.request.post(api,{headers:{Origin:origin},data:{action,operationId:crypto.randomUUID(),...p}});expect(r.status()).toBe(200);return r.json();};
 await post('demo',{staffId:'demo-leitung'});
 const {eventId}=await post('createEvent',{eventId:'demo-fruehjahr',name:'Browser recovery '+crypto.randomUUID(),date:'2026-11-21',commission:1500,sellerMin:1,sellerMax:150,tillCount:6});
 const {tillId}=await post('openTill',{eventId,number:1,opening:10000});
 await page.addInitScript(({key,record})=>{if(localStorage.getItem(key)===null)localStorage.setItem(key,JSON.stringify(record));},{key,record:{...emptyRegister(),eventId,tillId}});
 await page.goto(origin+basePath+'/');
 await expect(page.getByRole('button',{name:'Zum Einkauf hinzufügen'})).toBeEnabled();
 return {eventId,tillId,post,state:async()=>{const r=await context.request.get(api+'?event='+eventId);expect(r.status()).toBe(200);return r.json();}};
}
async function basket(page:Page) {
 await page.getByRole('textbox',{name:'Verkäufernummer',exact:true}).fill('42');
 await page.getByRole('textbox',{name:'Artikelpreis',exact:true}).fill('6,50');
 await page.getByRole('button',{name:'Zum Einkauf hinzufügen'}).click();
 await page.getByRole('textbox',{name:'Aufrunden auf',exact:true}).fill('7');
 await page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true}).fill('10');
}
async function receipt(page:Page) {
 await expect(page.getByText('VERKAUF #0001 GESPEICHERT')).toBeVisible();
 await expect(page.locator('.change-box strong')).toHaveText(/3,00/);
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
 expect(saved.pending).toBeNull();expect(saved.items).toEqual([]);expect(saved.lastSale.change).toBe(300);
}
async function pending(page:Page) {
 await expect.poll(()=>page.evaluate(key=>!!JSON.parse(localStorage.getItem(key)!).pending,key)).toBe(true);
}

test('draft including unsubmitted input survives reload; a receipt replaces basket and pending together',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);
 await page.getByRole('textbox',{name:'Verkäufernummer',exact:true}).fill('7');await page.getByRole('textbox',{name:'Artikelpreis',exact:true}).fill('2,00');
 await page.reload();await expect(page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true})).toHaveValue('10');
 await expect(page.getByRole('textbox',{name:'Verkäufernummer',exact:true})).toHaveValue('7');await expect(page.getByRole('textbox',{name:'Artikelpreis',exact:true})).toHaveValue('2,00');
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await receipt(page);await page.reload();await receipt(page);
 expect((await fixture.state()).sales).toHaveLength(1);
});

test('lost reply after server commit recovers the original receipt after reload without a second sale POST',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);let posts=0;
 await context.route('**/api/basar',async route=>{if(route.request().postDataJSON()?.action==='sale'){posts++;const r=await route.fetch();expect(r.status()).toBe(200);await route.abort('failed');}else await route.continue();});
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await pending(page);
 await expect(page.getByText(/Verbindung unterbrochen/)).toBeVisible();
 await page.reload();await receipt(page);expect(posts).toBe(1);expect((await fixture.state()).sales).toHaveLength(1);
});

test('request lost before server arrival survives closing the tab and resumes with the same ID',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);const ids:string[]=[];let reopened=false;
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){ids.push(route.request().postDataJSON().operationId);if(!reopened)return route.abort('failed');}await route.continue();});
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await pending(page);await expect(page.getByText(/Verbindung unterbrochen/)).toBeVisible();
 await page.close();reopened=true;const restored=await context.newPage();await restored.goto(origin+basePath+'/');await receipt(restored);
 expect(new Set(ids).size).toBe(1);expect(ids.length).toBeGreaterThanOrEqual(2); // Wake events may replay transport; the operation and financial effect stay unique.
 expect((await fixture.state()).sales).toHaveLength(1);
});

test('offline and expired session retain pending work until the same person logs in again',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);let first=true;const ids:string[]=[];
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){ids.push(route.request().postDataJSON().operationId);if(first){first=false;return route.abort('failed');}}await route.continue();});
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await pending(page);await expect(page.getByText(/Verbindung unterbrochen/)).toBeVisible();
 await context.setOffline(true);await context.clearCookies();await pending(page);await context.setOffline(false);await page.reload();
 await page.getByRole('button',{name:'Erneut anmelden',exact:true}).click();
 await expect(page.locator('.login-person')).toContainText('Kassenleitung');await expect(page.getByRole('combobox',{name:'Name',exact:true})).toHaveCount(0);
 await page.getByLabel('Persönliche PIN',{exact:true}).fill('1234');await page.getByRole('button',{name:'Weiterarbeiten',exact:true}).click();
 await receipt(page);expect(new Set(ids).size).toBe(1);expect((await fixture.state()).sales).toHaveLength(1);
});

test('failure persisting the acknowledged receipt keeps the original pending command recoverable',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);
 await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key&&JSON.parse(v).lastSale)throw new DOMException('Injected quota failure','QuotaExceededError');return original.call(this,k,v);};},key);
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await expect(page.getByText(/Kassenstand konnte nicht sicher gespeichert/)).toBeVisible();await pending(page);
 await page.reload();await receipt(page);expect((await fixture.state()).sales).toHaveLength(1);
});

test('a second tab is blocked until the first releases ownership, then sees the original receipt',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);const other=await context.newPage();await other.goto(origin+basePath+'/');
 await expect(other.getByText(/in einem anderen Tab/)).toBeVisible();await page.getByRole('button',{name:'Verkauf abschließen'}).click();await receipt(page);
 await page.close();await receipt(other);expect((await fixture.state()).sales).toHaveLength(1);
});
for(const status of [409,503])test(`HTTP ${status} without a recorded outcome preserves the ID through retries and pageshow recovery`,async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);const ids:string[]=[];let blocked=true;
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){ids.push(route.request().postDataJSON().operationId);if(blocked)return route.fulfill({status,contentType:'application/json',body:JSON.stringify({error:'Injected transient failure',code:status===409?'CONCURRENT_WRITE':'OUTCOME_UNKNOWN',recorded:false})});}await route.continue();});
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await expect(page.getByText('Injected transient failure')).toBeVisible();await pending(page);expect((await fixture.state()).sales).toHaveLength(0);
 blocked=false;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await receipt(page);expect(new Set(ids).size).toBe(1);expect((await fixture.state()).sales).toHaveLength(1);
});

test('a recorded business rejection clears only the pending command and retains the unbooked basket',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale')await fixture.post('eventStatus',{eventId:fixture.eventId,status:'settlement'});await route.continue();});
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();
 await expect(page.getByText(/Nicht gebucht:/)).toBeVisible();
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),key);
 expect(saved.pending).toBeNull();expect(saved.lastSale).toBeNull();expect(saved.items).toHaveLength(1);expect((await fixture.state()).sales).toHaveLength(0);
});

test('if the pending intent cannot be saved locally, no sale request is transmitted',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);let posts=0;
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale')posts++;await route.continue();});
 await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key&&JSON.parse(v).pending)throw new DOMException('Injected quota failure','QuotaExceededError');return original.call(this,k,v);};},key);
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await expect(page.getByText(/Kassenstand konnte nicht sicher gespeichert/)).toBeVisible();
 expect(posts).toBe(0);expect((await fixture.state()).sales).toHaveLength(0);
});

test('interruption immediately after adding an item cannot restore that item in both basket and entry fields',async({context,page})=>{
 await setup(context,page);
 await page.getByRole('textbox',{name:'Verkäufernummer',exact:true}).fill('42');await page.getByRole('textbox',{name:'Artikelpreis',exact:true}).fill('6,50');
 await page.evaluate(key=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){const before=k===key?JSON.parse(this.getItem(k)!):null;original.call(this,k,v);if(k===key&&!before.items.length&&JSON.parse(v).items.length===1)throw new DOMException('Interrupted after write','QuotaExceededError');};},key);
 await page.getByRole('button',{name:'Zum Einkauf hinzufügen'}).click();await expect(page.getByText(/Kassenstand konnte nicht sicher gespeichert/)).toBeVisible();
 await page.reload();await expect(page.locator('.basket-row')).toHaveCount(1);await expect(page.getByRole('textbox',{name:'Verkäufernummer',exact:true})).toHaveValue('');await expect(page.getByRole('textbox',{name:'Artikelpreis',exact:true})).toHaveValue('');
});

test('waking while a committed sale reply is still suspended retrieves the receipt without waiting for the old response',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);let release!:()=>void,committed!:()=>void,posts=0;
 const hold=new Promise<void>(resolve=>{release=resolve;}),saved=new Promise<void>(resolve=>{committed=resolve;});
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){posts++;const response=await route.fetch();expect(response.status()).toBe(200);committed();await hold;try{await route.abort('failed');}catch{/* The wake handler may already have cancelled the browser request. */}}else await route.continue();});
 try {
  await page.getByRole('button',{name:'Verkauf abschließen'}).click();await saved;
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await receipt(page);
  expect(posts).toBe(1);expect((await fixture.state()).sales).toHaveLength(1);
 } finally {release();}
});


test('a valid session survives reload and wake without another login, retaining the basket',async({context,page})=>{
 await setup(context,page);await basket(page);let logins=0;
 page.on('request',request=>{if(request.method()==='POST'&&['login','demo'].includes(request.postDataJSON()?.action))logins++;});
 await page.reload();await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 await expect(page.locator('.profile')).toContainText('Kassenleitung');
 await expect(page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true})).toHaveValue('10');
 await expect(page.getByRole('button',{name:'Verkauf abschließen'})).toBeEnabled();
 expect(logins).toBe(0);expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).lastStaffId,key)).toBe('demo-leitung');
});

test('remembered personal login needs only a PIN; a wrong PIN preserves the draft and never enters storage',async({context,page})=>{
 const fixture=await setup(context,page),staffId=crypto.randomUUID();
 await fixture.post('addStaff',{eventId:fixture.eventId,operationId:staffId,name:'Recovery cashier '+staffId,role:'cashier',pin:'5826'});
 await fixture.post('login',{staffId,pin:'5826'});await page.reload();await basket(page);
 await context.clearCookies();await page.reload();await page.getByRole('button',{name:'Erneut anmelden',exact:true}).click();
 await expect(page.locator('.login-person')).toContainText('Recovery cashier');
 const pin=page.getByLabel('Persönliche PIN',{exact:true});await expect(pin).toBeFocused();
 await pin.fill('0000');await page.getByRole('button',{name:'Weiterarbeiten',exact:true}).click();
 await expect(page.locator('dialog').getByRole('alert')).toContainText('Name oder PIN stimmt nicht.');await expect(pin).toHaveValue('');await expect(pin).toBeFocused();
 await pin.fill('5826');await pin.press('Enter');await expect(page.locator('dialog')).not.toBeVisible();
 await expect(page.locator('.profile')).toContainText('Recovery cashier');await expect(page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true})).toHaveValue('10');
 const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(storage).not.toContain('5826');expect(storage).not.toContain('basar_session');
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await receipt(page);expect((await fixture.state()).sales[0].staff_id).toBe(staffId);
});

test('pending recovery selects the original cashier even when another person is remembered',async({context,page})=>{
 const fixture=await setup(context,page),staffId=crypto.randomUUID();
 await fixture.post('addStaff',{eventId:fixture.eventId,operationId:staffId,name:'Original cashier '+staffId,role:'cashier',pin:'71925826'});
 await fixture.post('login',{staffId,pin:'71925826'});await page.reload();await basket(page);let blocked=true;const ids:string[]=[];
 await context.route('**/api/basar',async route=>{if(route.request().method()==='POST'&&route.request().postDataJSON()?.action==='sale'){ids.push(route.request().postDataJSON().operationId);if(blocked)return route.abort('failed');}await route.continue();});
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await pending(page);await expect(page.getByText(/Verbindung unterbrochen/)).toBeVisible();
 await fixture.post('demo',{staffId:'demo-leitung'});await page.reload();
 await expect.poll(()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).lastStaffId,key)).toBe('demo-leitung');
 await page.getByRole('button',{name:'Erneut anmelden',exact:true}).click();await expect(page.locator('.login-person')).toContainText('Original cashier');
 await expect(page.getByRole('button',{name:'Andere Person',exact:true})).toHaveCount(0);await expect(page.getByText('Übungsrollen anzeigen')).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Name',exact:true})).toHaveCount(0);blocked=false;
 await page.getByLabel('Persönliche PIN',{exact:true}).fill('71925826');await page.getByRole('button',{name:'Anmelden',exact:true}).click();
 await receipt(page);expect(new Set(ids).size).toBe(1);const sales=(await fixture.state()).sales;expect(sales).toHaveLength(1);expect(sales[0].staff_id).toBe(staffId);
});

test('a deliberate person switch uses the new PIN and preserves an unsubmitted basket',async({context,page})=>{
 const fixture=await setup(context,page);await basket(page);await page.locator('.profile').click();
 await page.getByRole('combobox',{name:'Name',exact:true}).selectOption('demo-kasse');
 await page.getByLabel('Persönliche PIN',{exact:true}).fill('1234');await page.getByRole('button',{name:'Anmelden',exact:true}).click();
 await expect(page.locator('dialog')).not.toBeVisible();await expect(page.locator('.profile')).toContainText('Kassiererin');
 await expect(page.getByRole('textbox',{name:'Erhaltenes Bargeld',exact:true})).toHaveValue('10');
 await page.getByRole('button',{name:'Verkauf abschließen'}).click();await receipt(page);expect((await fixture.state()).sales[0].staff_id).toBe('demo-kasse');
});


test('paged sales retain full totals, search older receipts and export the whole event',async({context,page})=>{
 const fixture=await setup(context,page);
 for(let n=1;n<=55;n++)await fixture.post('sale',{eventId:fixture.eventId,tillId:fixture.tillId,items:[{id:crypto.randomUUID(),seller:n===1?147:42,price:100}],received:100});
 await page.reload();await page.getByRole('button',{name:'Verkäufe',exact:true}).click();
 await expect(page.locator('tbody tr')).toHaveCount(50);await expect(page.locator('.stat-card').filter({hasText:'Einkäufe'}).locator('strong')).toHaveText('55');
 await page.getByRole('button',{name:'Ältere Verkäufe',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(5);
 await page.getByRole('button',{name:'Neuere Verkäufe',exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(50);
 await page.getByRole('textbox',{name:'Verkäufe suchen',exact:true}).fill('147');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('#0001');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'CSV',exact:true}).click();const file=await (await download).path();expect(readFileSync(file!,'utf8').trim().split('\n')).toHaveLength(56);
});

test('operational dashboard requires a manager and marks missing backup evidence as critical',async({context,page})=>{
 const fixture=await setup(context,page);await page.goto(origin+basePath+'/health');
 await expect(page.locator('.health-overall h2')).toHaveText('Handlungsbedarf');await expect(page.getByText('Noch keine geprüfte Sicherung bestätigt')).toHaveCount(2);
 await fixture.post('demo',{staffId:'demo-kasse'});expect((await context.request.get(origin+basePath+'/api/health')).status()).toBe(403);
 await context.clearCookies();expect((await context.request.get(origin+basePath+'/api/health')).status()).toBe(401);
});

test('dashboard cannot leave its last green state on screen after connectivity fails',async({context,page})=>{
 await setup(context,page);let blocked=false;
 await context.route('**/api/health',route=>blocked?route.abort('failed'):route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ok',checkedAt:new Date().toISOString(),release:'synthetic',uptimeSeconds:60,memoryBytes:1000,checks:[{id:'mac-backup',label:'Mac-Sicherung',status:'ok',detail:'Vor 1 Min. geprüft'}]})}));
 await page.goto(origin+basePath+'/health');await expect(page.locator('.health-overall h2')).toHaveText('Betrieb überwacht');
 blocked=true;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect(page.locator('.health-overall h2')).toHaveText('Handlungsbedarf');await expect(page.locator('.health-card h2')).toHaveText('Nicht aktuell');
});
