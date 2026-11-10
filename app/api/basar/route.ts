import {CLIENT_ENTRY_FORMAT} from '@/lib/basar/client-version';
import {readTeam} from '@/lib/basar/team';
import {recordApiResult} from '@/lib/basar/health';
import {assertWriteEpoch} from '@/lib/basar/queries';
import {bootstrap, auth, login, logout, readState, readRegisterState, mutate, operationStatus, ApiError} from '@/lib/basar/service';
import {isSameOrigin, sessionCookie} from '@/lib/basar/http';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, {status, headers: {'Cache-Control': 'no-store', ...headers}});

export async function GET(request: Request) {
  try {
    await bootstrap();
    const user = await auth(request);
    const query=new URL(request.url).searchParams;
    if(query.get('view')==='team'){if(!user)throw new ApiError('Bitte als Kassenleitung anmelden.',401,'AUTH_REQUIRED');if(!query.get('event'))throw new ApiError('Bitte einen Basar wählen.');return json({team:await readTeam(query.get('event')!,user,query.get('revealPins')==='1')});}
    if(query.get('view')==='register'){
      const before=query.has('before')?Number(query.get('before')):undefined;
      if(before!==undefined&&(!Number.isSafeInteger(before)||before<1))throw new ApiError('Ungültige Verkaufsseite.');
      const search=query.get('search')||'';if(search.length>80)throw new ApiError('Der Suchtext ist zu lang.');
      return json(await readRegisterState(query.get('event')||undefined,user,{before,search}));
    }
    return json(await readState(query.get('event') || undefined, user));
  } catch (error) {
    return json({error: error instanceof ApiError ? error.message : 'Die Daten konnten nicht geladen werden. Bitte die Verbindung prüfen.',...(error instanceof ApiError?{code:error.code}:{})}, error instanceof ApiError ? error.status : 503);
  }
}

async function handlePost(request: Request) {
  try {
    if (!isSameOrigin(request)) return json({error:'Ungültiger Anfrageursprung.',code:'ORIGIN_REJECTED'},403);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({error:'JSON erforderlich.',code:'INVALID_REQUEST'},415);
    const bodyText=await request.text();
    if(bodyText.length>150000) return json({error:'Die Anfrage ist zu groß.',code:'INVALID_REQUEST'},413);
    let body;
    try {body=JSON.parse(bodyText);} catch {return json({error:'Ungültige Anfrage.',code:'INVALID_REQUEST'},400);}
    if(!body || typeof body!=='object' || typeof body.action!=='string') return json({error:'Ungültige Anfrage.',code:'INVALID_REQUEST'},400);
    await bootstrap();
    if(body.action==='login'||body.action==='demo') {
      if(body.action==='demo'&&!['demo-leitung','demo-kasse'].includes(body.staffId)) throw new ApiError('Ungültige Übungsrolle.');
      const token=await login(body.staffId,body.action==='demo'?'1234':body.pin,request);
      const headers=new Headers(request.headers);headers.set('cookie','basar_session='+token);const person=await auth(new Request(request.url,{headers}));
      return json({ok:true,eventId:person?.event_id??undefined,tillNumber:person?.till_number??undefined},200,{'Set-Cookie':sessionCookie(request,token)});
    }
    if(body.action==='logout') {
      await logout(request);
      return json({ok:true},200,{'Set-Cookie':sessionCookie(request,null)});
    }
    const user=await auth(request);
    if(!user) throw new ApiError('Bitte erneut mit derselben Person anmelden. Der offene Vorgang bleibt erhalten.',401,'AUTH_REQUIRED');
    if(body.action==='operationStatus') {
      if(!body.command || typeof body.command.action!=='string') throw new ApiError('Die Buchungsdaten fehlen.');
      await assertWriteEpoch(body.command);
      return json(await operationStatus(body.command.action,body.command,user));
    }
    if(body.entryFormat!==CLIENT_ENTRY_FORMAT){
      await assertWriteEpoch(body);
      const stored=await operationStatus(body.action,body,user);
      if(stored.state==='committed')return json(stored.result);
      if(stored.state==='rejected')throw new ApiError(stored.error,stored.status,stored.code,true);
      throw new ApiError('Die Anwendung wurde aktualisiert. Bitte die Seite neu laden; der offene Einkauf bleibt erhalten. Bei älteren Preisvorgängen die Kassenleitung hinzuziehen.',409,'CLIENT_UPGRADE_REQUIRED');
    }
    return json(await mutate(body.action,body,user));
  } catch(error) {
    if(error instanceof ApiError) return json({error:error.message,code:error.code,recorded:error.recorded},error.status);
    // An unclassified storage failure has an uncertain outcome. Never call it an input error.
    return json({error:'Das Buchungsergebnis ist noch unklar. Bitte die Verbindung wiederherstellen und den Status prüfen.',code:'OUTCOME_UNKNOWN',recorded:false},503);
  }
}

export async function POST(request:Request){const start=performance.now();const response=await handlePost(request);recordApiResult(response.status,performance.now()-start);return response;}
