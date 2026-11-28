import { signedIn, sameOrigin } from '@/lib/auth';
import { failure } from '@/lib/http';
import { InputError } from '@/lib/db';
import { listTeams, saveRoster } from '@/lib/rosters';
export async function GET() {
  try {
    if (!(await signedIn())) throw new InputError('Admin login required.', 401);
    return Response.json(await listTeams(), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (err) {
    return failure(err);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (!(await signedIn())) throw new InputError('Admin login required.', 401);
    const { id } = await saveRoster(await req.json(), { admin: true });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    return failure(err);
  }
}
