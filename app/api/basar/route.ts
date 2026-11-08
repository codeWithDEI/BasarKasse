import {bootstrap, auth, login, logout, readState, mutate, ApiError} from '@/lib/basar/service';
import {isSameOrigin, sessionCookie} from '@/lib/basar/http';

export const dynamic = 'force-dynamic';
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, {status, headers: {'Cache-Control': 'no-store', ...headers}});

export async function GET(request: Request) {
  try {
    await bootstrap();
    const user = await auth(request);
    return json(await readState(new URL(request.url).searchParams.get('event') || undefined, user));
  } catch (error) {
    return json({error: error instanceof ApiError ? error.message : 'Die Daten konnten nicht geladen werden. Bitte die Verbindung prüfen.'}, error instanceof ApiError ? error.status : 503);
  }
}

export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return json({error: 'Ungültiger Anfrageursprung.'}, 403);
    if (!request.headers.get('content-type')?.includes('application/json')) return json({error: 'JSON erforderlich.'}, 415);
    const bodyText = await request.text();
    if (bodyText.length > 150000) return json({error: 'Die Anfrage ist zu groß.'}, 413);
    const body = JSON.parse(bodyText);
    await bootstrap();
    if (body.action === 'login' || body.action === 'demo') {
      if (body.action === 'demo' && !['demo-leitung', 'demo-kasse'].includes(body.staffId)) throw new ApiError('Ungültige Übungsrolle.');
      const token = await login(body.staffId, body.action === 'demo' ? '1234' : body.pin, request);
      return json({ok: true}, 200, {'Set-Cookie': sessionCookie(request, token)});
    }
    if (body.action === 'logout') {
      await logout(request);
      return json({ok: true}, 200, {'Set-Cookie': sessionCookie(request, null)});
    }
    const user = await auth(request);
    if (!user) throw new ApiError('Bitte zuerst anmelden.', 401);
    return json(await mutate(body.action, body, user));
  } catch (error) {
    if (error instanceof SyntaxError) return json({error: 'Ungültige Anfrage.'}, 400);
    return json({error: error instanceof Error ? error.message : 'Der Vorgang konnte nicht gespeichert werden.'}, error instanceof ApiError ? error.status : 400);
  }
}
