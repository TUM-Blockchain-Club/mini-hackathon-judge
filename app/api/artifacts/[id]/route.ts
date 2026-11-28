import { z } from 'zod';
import { juryAccess } from '@/lib/auth';
import { db } from '@/lib/db';
export async function GET(
  _req: Request,
  { params }: RouteContext<'/api/artifacts/[id]'>,
) {
  if (!(await juryAccess())) return new Response(null, { status: 401 });
  const { id } = await params;
  if (!z.uuid().safeParse(id).success)
    return new Response(null, { status: 404 });
  const [row] =
    await db()`SELECT content,filename FROM submissions WHERE id=${id}`;
  if (!row) return new Response(null, { status: 404 });
  const bytes: Buffer = row.content;
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = bytes.subarray(offset, offset + 65536);
      if (!chunk.length) {
        controller.close();
        return;
      }
      offset += chunk.length;
      controller.enqueue(chunk);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition':
        "attachment; filename*=UTF-8''" + encodeURIComponent(row.filename),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
