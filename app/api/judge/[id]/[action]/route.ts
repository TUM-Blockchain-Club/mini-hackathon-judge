import { z } from 'zod';
import { officialCriteria } from '@/judge/official';
import { jobName, verifyTicket, judgeModelId } from '@/judge/cloud';
import {
  planInspection,
  grade,
  validationDetail,
  type Run,
  type Evidence,
} from '@/judge/model';
import { db, InputError } from '@/lib/db';
import { failure } from '@/lib/http';

export const maxDuration = 100;
const chunkSize = 1024 * 1024;
const phaseInput = z.object({
  phase: z.enum(['inspect', 'crosscheck']),
  turn: z.number().int().min(1).max(20),
});
const evidenceInput = z.object({
  ref: z.string().regex(/^(inventory|I(0[1-9]|1[0-9]|20)-[12]|V0[1-5]-[12])$/),
  command: z.string().min(1).max(1600),
  output: z.string().max(7000),
});
async function history(id: string) {
  return db()<
    Evidence[]
  >`SELECT ref,command,output FROM observations WHERE run_id=${id} ORDER BY ref`;
}

export async function POST(
  req: Request,
  ctx: RouteContext<'/api/judge/[id]/[action]'>,
) {
  try {
    const { id, action } = await ctx.params;
    if (!z.uuid().safeParse(id).success)
      throw new InputError('Invalid run.', 404);
    verifyTicket(
      id,
      req.headers.get('authorization'),
      action === 'probe-result' ? 'probe' : 'run',
    );
    const owner = req.headers.get('x-judge-execution') || '';
    if (!new RegExp('^' + jobName + '-[a-z0-9-]{1,48}$').test(owner))
      throw new InputError('Invalid execution.', 403);
    if (action === 'probe-result') {
      const { output } = z
        .object({ output: z.literal('exit 0\ncloud-sandbox-fixture\n') })
        .parse(await req.json());
      const run: Run = {
        id,
        owner,
        model: judgeModelId,
        until: Date.now() + 450_000,
        snapshot: 'probe',
        focus: 'fixture',
        criteria: officialCriteria,
        guide: {
          revision: 'sandbox-probe',
          ids: ['R0-1'],
          instructions:
            'Synthetic rehearsal. R0-1 checks whether fixture.txt contains cloud-sandbox-fixture. Explain any missing evidence under S1 through S4. Demo question: can you repeat the file check?',
        },
      };
      const evidence = [
        { ref: 'I01-1', command: 'cat fixture.txt', output },
        {
          ref: 'V01-1',
          command: 'touch copy-test and check that the original rejects writes',
          output: 'exit 0',
        },
      ];
      let stage = 'inspection';
      try {
        await planInspection(run, evidence, 'inspect', 1);
        stage = 'scorecard';
        const { points } = await grade(run, evidence);
        return Response.json({ points });
      } catch (err) {
        const status =
          err && typeof err === 'object' && 'statusCode' in err
            ? String(err.statusCode)
            : 'unknown';
        throw new InputError(
          'Synthetic ' +
            stage +
            ' check failed (' +
            status +
            '). ' +
            validationDetail(err),
          502,
        );
      }
    }
    const sql = db();
    if (action === 'claim') {
      const [row] =
        await sql`UPDATE judge_runs j SET worker=${owner},phase=CASE WHEN worker IS NULL THEN 'inspecting' ELSE phase END
        FROM submissions s WHERE j.id=${id} AND s.id=j.submission_id AND (j.worker IS NULL OR j.worker=${owner})
        AND j.phase NOT IN ('complete','review') AND j.until_at>clock_timestamp()
        RETURNING j.until_at,s.filename,coalesce(j.archive_digest,s.digest) AS digest,octet_length(coalesce(j.archive_content,s.content)) AS size,(j.rubric ? 'guide' AND s.focus LIKE 'tax-%') AS tax`;
      return Response.json(
        row
          ? {
              claimed: true,
              until: +row.until_at,
              filename: row.filename,
              digest: row.digest,
              size: row.size,
              tax: row.tax,
            }
          : { claimed: false },
      );
    }
    const [row] =
      await sql`SELECT j.phase,j.until_at,j.model,j.rubric,j.snapshot,j.submission_id,s.focus,s.own_topic
      FROM judge_runs j JOIN submissions s ON s.id=j.submission_id WHERE j.id=${id} AND j.worker=${owner}`;
    if (!row) throw new InputError('Run is owned by another execution.', 403);
    if (action === 'finalize' && row.phase === 'complete')
      return Response.json({ ok: true });
    if (row.phase === 'complete' || row.phase === 'review')
      throw new InputError('Run has ended.', 409);
    if (action === 'review') {
      const { issue } = z
        .object({ issue: z.string().min(1).max(500) })
        .parse(await req.json());
      await sql`UPDATE judge_runs SET phase='review',issue=${issue} WHERE id=${id} AND worker=${owner} AND phase NOT IN ('complete','review')`;
      return Response.json({ ok: true });
    }
    const until = +row.until_at;
    if (Date.now() >= until)
      throw new InputError('Judging deadline elapsed.', 409);
    const run: Run = {
      id,
      owner,
      until,
      model: row.model,
      snapshot: row.snapshot,
      focus: row.focus,
      participantTopic: row.own_topic,
      criteria: row.rubric.criteria,
      guide: row.rubric.guide,
    };
    switch (action) {
      case 'artifact': {
        const value = new URL(req.url).searchParams.get('part');
        if (!value || !/^([0-9]|1[0-9]|2[0-3])$/.test(value))
          throw new InputError('Invalid artifact chunk.');
        const [piece] =
          await sql`SELECT substring(coalesce(j.archive_content,s.content) from ${Number(value) * chunkSize + 1}::int for ${chunkSize}::int) AS bytes FROM submissions s JOIN judge_runs j ON j.submission_id=s.id WHERE j.id=${id}`;
        return new Response(new Uint8Array(piece.bytes), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'private, no-store',
          },
        });
      }
      case 'observe': {
        const o = evidenceInput.parse(await req.json());
        if (o.ref.startsWith('V') && Date.now() < until - 300_000)
          throw new InputError('Verification opens at minute ten.', 409);
        await sql`INSERT INTO observations(run_id,ref,command,output)
          SELECT id,${o.ref},${o.command.replaceAll('\0', '')},${o.output.replaceAll('\0', '').slice(0, 6500)} FROM judge_runs
          WHERE id=${id} AND worker=${owner} AND phase IN ('inspecting','cross-checking') AND until_at>clock_timestamp()
          ON CONFLICT(run_id,ref) DO NOTHING`;
        break;
      }
      case 'plan': {
        const { phase, turn } = phaseInput.parse(await req.json());
        const verify = phase === 'crosscheck';
        if (verify && (turn > 5 || Date.now() < until - 300_000))
          throw new InputError('Invalid verification round.', 409);
        if (Date.now() >= until - (verify ? 65_000 : 300_000) - 1500)
          return Response.json({ commands: [], covered: true });
        await sql`UPDATE judge_runs SET phase=${verify ? 'cross-checking' : 'inspecting'} WHERE id=${id} AND worker=${owner} AND phase IN ('inspecting','cross-checking')`;
        return Response.json(
          await planInspection(run, await history(id), phase, turn),
        );
      }
      case 'finalize': {
        if (Date.now() < until - 300_000)
          throw new InputError('Cross-check required.', 409);
        const updated =
          await sql`UPDATE judge_runs SET phase='scoring' WHERE id=${id} AND worker=${owner} AND phase='cross-checking' RETURNING id`;
        if (!updated.length)
          throw new InputError(
            'Scoring is already active or the cross-check is incomplete.',
            409,
          );
        const { points, output } = await grade(run, await history(id));
        const saved =
          await sql`UPDATE judge_runs SET points=${points},scorecard=${sql.json(output)},phase='complete',issue=NULL
          WHERE id=${id} AND worker=${owner} AND phase='scoring' AND until_at>clock_timestamp() RETURNING id`;
        if (!saved.length)
          throw new InputError('Scorecard missed the deadline.', 409);
        break;
      }
      default:
        throw new InputError('Unknown worker action.', 404);
    }
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError)
      return failure(new InputError('Invalid worker message.'));
    return failure(e);
  }
}
