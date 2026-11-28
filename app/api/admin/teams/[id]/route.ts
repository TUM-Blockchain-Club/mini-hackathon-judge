import { signedIn, sameOrigin } from '@/lib/auth';
import { failure } from '@/lib/http';
import { InputError } from '@/lib/db';
import { deleteTeam, saveRoster } from '@/lib/rosters';
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
    await saveRoster(await req.json(), { admin: true, teamId: id });
    return Response.json({ id });
  } catch (err) {
    return failure(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: RouteContext<'/api/admin/teams/[id]'>,
) {
  try {
    sameOrigin(req);
    if (!(await signedIn())) throw new InputError('Admin login required.', 401);
    const { id } = await params;
    if (!z.uuid().safeParse(id).success)
      throw new InputError('Team not found.', 404);
    const confirmation = z
      .object({
        name: z.string().min(1),
        revision: z.number().int().nonnegative(),
      })
      .safeParse(await req.json().catch(() => null));
    if (!confirmation.success)
      throw new InputError('Confirm the selected team before deleting.');
    await deleteTeam(id, confirmation.data.name, confirmation.data.revision);
    return Response.json({ id });
  } catch (err) {
    return failure(err);
  }
}
