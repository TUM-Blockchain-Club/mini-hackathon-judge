import { signedIn, sameOrigin } from '@/lib/auth';
import { failure } from '@/lib/http';
import { InputError } from '@/lib/db';
import { saveRoster } from '@/lib/rosters';
import { z } from 'zod';
export async function PATCH(
  req: Request,
  { params }: RouteContext<'/api/admin/teams/[id]'>,
) {
  try {
    sameOrigin(req);
    if (!(await signedIn())) throw new InputError('Admin login required.', 401);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new InputError('Team not found.', 404);
    await saveRoster(await req.json(), { teamId: id });
    return Response.json({ id });
  } catch (err) {
    return failure(err);
  }
}
