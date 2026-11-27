import { start } from 'workflow/api';
import { judgeSubmission } from '@/judge/workflow';
import { configure, freezeBatch } from '@/lib/store';
import { sameOrigin, throttle, login, logout, signedIn } from '@/lib/auth';
import { db, InputError } from '@/lib/db';
import { failure } from '@/lib/http';
export const maxDuration = 60;
export async function POST(
  request: Request,
  ctx: RouteContext<'/api/organizer/[action]'>,
) {
  try {
    sameOrigin(request);
    const { action } = await ctx.params;
    if (action === 'login') {
      await throttle(request, 'login', 15);
      const { password } = await request.json();
      await login(String(password));
      return Response.json({ ok: true });
    }
    if (!(await signedIn()))
      throw new InputError('Sign in to the organizer desk.', 401);
    if (action === 'logout') {
      await logout();
      return Response.json({ ok: true });
    }
    const body = await request.json();
    switch (action) {
      case 'settings':
        await configure(String(body.deadline), body.rubric);
        break;
      case 'judge': {
        const jobs = await freezeBatch();
        const result = await Promise.allSettled(
          jobs.map((id) => start(judgeSubmission, [id])),
        );
        if (result.some((r) => r.status === 'rejected'))
          throw new InputError(
            'Some sessions could not start. Use Resume dispatch to enqueue any unclaimed submissions.',
            503,
          );
        return Response.json({ queued: jobs.length });
      }
      case 'pitch': {
        if (
          !Number.isInteger(body.points) ||
          body.points < 0 ||
          body.points > 50 ||
          !/^[-0-9a-f]{36}$/i.test(String(body.team))
        )
          throw new InputError(
            'Pitch scores must be whole numbers from 0 to 50.',
          );
        const rows =
          await db()`UPDATE teams SET pitch=${body.points} WHERE id=${body.team} RETURNING id`;
        if (!rows.length) throw new InputError('Team not found.', 404);
        break;
      }
      default:
        throw new InputError('Unknown action.', 404);
    }
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
