import { currentTeam } from '@/lib/rosters';
import { capture } from '@/lib/artifacts';
import { latestReceipt, publicEvent, saveSubmission } from '@/lib/store';
import { sameOrigin, throttle } from '@/lib/auth';
import { InputError } from '@/lib/db';
import { failure } from '@/lib/http';
export const maxDuration = 60;
export async function GET() {
  try {
    const [event, team] = await Promise.all([publicEvent(), currentTeam()]);
    return Response.json(
      {
        ...event,
        team: team ? { id: team.id, name: team.name } : null,
        receipt: team ? await latestReceipt(team.id) : null,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    return failure(err);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const team = await currentTeam();
    if (!team) throw new InputError('Log in to your team to submit.', 401);
    if (Number(request.headers.get('content-length')) > 16 * 1024)
      throw new InputError('Submission form is too large.', 413);
    const event = await publicEvent();
    if (event.state !== 'open' && event.state !== 'late')
      throw new InputError('The submission window is closed.', 409);
    await throttle(request, 'submit', 100);
    const data = await request.formData();
    if (data.has('sessionTeam') && data.get('sessionTeam') !== team.id)
      throw new InputError(
        'Your team session changed. Check your login before submitting.',
        401,
      );
    const description = data.get('description');
    if (typeof description !== 'string' || !description.trim() ||
        description.trim().length > 500 || description.includes('\0'))
      throw new InputError('Enter a short description of up to 500 characters.');
    const receipt = await saveSubmission(
      team.id,
      String(data.get('title') ?? ''),
      String(data.get('focus') ?? ''),
      await capture(data),
      data.get('ownTopic'),
      description.trim(),
    );
    return Response.json({ ...receipt, team: team.name }, { status: 201 });
  } catch (err) {
    return failure(err);
  }
}
