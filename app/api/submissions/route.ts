import { capture } from '@/lib/artifacts';
import { publicEvent, requireTeam, saveSubmission } from '@/lib/store';
import { sameOrigin, throttle } from '@/lib/auth';
import { InputError } from '@/lib/db';
import { failure } from '@/lib/http';
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get('content-length')) > 3.5 * 1024 * 1024)
      throw new InputError('Upload limit is 3 MiB.', 413);
    const event = await publicEvent();
    if (event.state !== 'open')
      throw new InputError('The submission window is closed.', 409);
    await throttle(request, 'submit', 100);
    const data = await request.formData(),
      team = await requireTeam(String(data.get('code') ?? ''));
    const receipt = await saveSubmission(
      team.id,
      String(data.get('title') ?? ''),
      String(data.get('focus') ?? ''),
      await capture(data),
    );
    return Response.json({ ...receipt, team: team.name }, { status: 201 });
  } catch (err) {
    return failure(err);
  }
}
