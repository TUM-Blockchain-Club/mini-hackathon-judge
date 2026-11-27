import { randomBytes } from 'node:crypto';
import { failure } from '@/lib/http';
import { sameOrigin, throttle } from '@/lib/auth';
import { InputError } from '@/lib/db';
import {
  authenticateTeam,
  currentTeam,
  saveRoster,
  setTeamCookie,
  signOutTeam,
} from '@/lib/rosters';
export async function GET(
  _: Request,
  { params }: RouteContext<'/api/team/[action]'>,
) {
  try {
    if ((await params).action !== 'me') throw new InputError('Not found.', 404);
    const team = await currentTeam();
    if (!team) throw new InputError('Log in to view your team.', 401);
    return Response.json(team, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return failure(err);
  }
}
export async function POST(
  req: Request,
  { params }: RouteContext<'/api/team/[action]'>,
) {
  try {
    sameOrigin(req);
    const { action } = await params;
    if (action === 'logout') {
      await signOutTeam();
      return Response.json({ ok: true });
    }
    if (action !== 'login' && action !== 'register')
      throw new InputError('Not found.', 404);
    await throttle(req, 'team-' + action, action === 'login' ? 40 : 25);
    const body = await req.json();
    if (action === 'register') {
      const token = randomBytes(32).toString('hex');
      await saveRoster(body, { token });
      await setTeamCookie(token);
      return Response.json({ ok: true }, { status: 201 });
    }
    await setTeamCookie(await authenticateTeam(body));
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
