import { z } from 'zod';
import { juryAccess } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET(
  _req: Request,
  { params }: RouteContext<'/api/evidence/[id]'>,
) {
  if (!(await juryAccess())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  const evidence =
    await db()`SELECT ref,command,output FROM observations WHERE run_id=${id} ORDER BY ref`;
  return Response.json(evidence, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
