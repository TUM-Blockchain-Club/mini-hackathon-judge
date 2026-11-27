import { start } from 'workflow/api';
import { judgeSubmission } from '@/judge/workflow';
import { officialRubric } from '@/judge/official';
import { importGuide } from '@/judge/guide';
import { configure, freezeBatch, desk } from '@/lib/store';
import { sameOrigin, throttle, login, logout, currentAdmin } from '@/lib/auth';
import { createAdmin, assignSeat, vote, reviewSubmission } from '@/lib/jury';
import { db, InputError } from '@/lib/db';
import { failure } from '@/lib/http';
import { z } from 'zod';
export const maxDuration = 60;
export async function GET(
  _req: Request,
  ctx: RouteContext<'/api/organizer/[action]'>,
) {
  try {
    const { action } = await ctx.params,
      admin = await currentAdmin();
    if (!admin) throw new InputError('Sign in to the organizer desk.', 401);
    if (action !== 'guide') throw new InputError('Unknown resource.', 404);
    if (!admin.owner && !admin.seat)
      throw new InputError('Jury access required.', 403);
    const [e] = await db()`SELECT guide FROM event_settings WHERE singleton`;
    if (!e.guide) throw new InputError('The guide has not been imported.', 404);
    return new Response(e.guide, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    return failure(err);
  }
}
export async function POST(
  request: Request,
  ctx: RouteContext<'/api/organizer/[action]'>,
) {
  try {
    sameOrigin(request);
    const { action } = await ctx.params;
    if (action === 'login') {
      await throttle(request, 'login', 15);
      const { password, name } = await request.json();
      await login(String(password), typeof name === 'string' ? name : '');
      return Response.json({ ok: true });
    }
    const a = await currentAdmin();
    if (!a) throw new InputError('Sign in to the organizer desk.', 401);
    if (action === 'logout') {
      await logout();
      return Response.json({ ok: true });
    }
    const body = await request.json();
    if (action === 'pitch') await vote(a.id, body);
    else {
      if (!a.owner) throw new InputError('Organizer access required.', 403);
      switch (action) {
        case 'admin':
          await createAdmin(body);
          break;
        case 'seat':
          await assignSeat(body);
          break;
        case 'review':
          await reviewSubmission(a.name, body);
          break;
        case 'tie': {
          const data = z
            .object({
              signature: z.string(),
              order: z.array(z.uuid()).min(2),
              reason: z.string().trim().min(1).max(1200),
            })
            .safeParse(body);
          if (!data.success)
            throw new InputError('Give the jury decision and team order.');
          const { signature, order, reason } = data.data;
          const tied = (await desk()).teams
            .filter((t) => t.tie === signature)
            .map((t) => t.id);
          if (
            tied.length !== order.length ||
            new Set(order).size !== order.length ||
            tied.some((id) => !order.includes(id))
          )
            throw new InputError(
              'The tie changed. Refresh the standings.',
              409,
            );
          const sql = db();
          await sql`INSERT INTO podium_decisions VALUES(${signature},${sql.json(order)},${reason}) ON CONFLICT(signature) DO UPDATE SET team_order=excluded.team_order,reason=excluded.reason`;
          break;
        }
        case 'guide': {
          await importGuide(body.guide);
          break;
        }
        case 'settings':
          await configure(String(body.deadline), officialRubric);
          break;
        case 'judge': {
          const jobs = await freezeBatch(true);
          const result = await Promise.allSettled(
            jobs.map((id) => start(judgeSubmission, [id])),
          );
          if (result.some((r) => r.status === 'rejected'))
            throw new InputError(
              'Some sessions could not start. Resume dispatch to retry.',
              503,
            );
          return Response.json({ queued: jobs.length });
        }
        default:
          throw new InputError('Unknown action.', 404);
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    return failure(err);
  }
}
