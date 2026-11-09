import {bootstrap,auth} from '@/lib/basar/service';
import '@/lib/basar/health';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
  const headers={'Cache-Control':'no-store'};
  try {
    await bootstrap();const user=await auth(request);
    if(!user)return Response.json({error:'Bitte als Kassenleitung anmelden.'},{status:401,headers});
    if(user.role!=='manager')return Response.json({error:'Die Statusseite ist der Kassenleitung vorbehalten.'},{status:403,headers});
    if(!globalThis.__basarHealth)return Response.json({error:'Die Betriebsüberwachung ist für diese Umgebung nicht eingerichtet.'},{status:503,headers});
    return Response.json(await globalThis.__basarHealth(),{headers});
  }catch{return Response.json({error:'Die Statusprüfung konnte nicht abgeschlossen werden.'},{status:503,headers});}
}
