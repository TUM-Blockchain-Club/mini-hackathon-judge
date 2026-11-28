import { randomUUID } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { checkModelAccess } from '@/judge/model';
import { cloudLauncher, judgeModelId } from '@/judge/cloud';
import { db, InputError } from '@/lib/db';
import { failure } from '@/lib/http';

const keys = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const audience = 'https://mini-hackathon-judge.vercel.app/api/judge/probe';
const builder = 'judge-build@tbc-mini-hackathon-judge.iam.gserviceaccount.com';

// A project operator can test the production dispatch path with a fixed fixture.
// This identity has no organizer capabilities and cannot start an event batch.
export async function POST(request: Request) {
  try {
    const token = request.headers
      .get('Authorization')
      ?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) throw new InputError('Google operator identity required.', 401);
    const verified = await jwtVerify(token, keys, {
      issuer: 'https://accounts.google.com',
      audience,
      algorithms: ['RS256'],
    }).catch(() => null);
    if (
      verified?.payload.email !== builder ||
      verified.payload.email_verified !== true
    )
      throw new InputError('Invalid cloud operator identity.', 403);
    const url = new URL(request.url);
    if (url.searchParams.get('check') === 'model') {
      const model = judgeModelId;
      await checkModelAccess(model);
      return Response.json({ model, available: true });
    }
    const [event] =
      await db()`SELECT guide IS NOT NULL AS guide_ready FROM event_settings WHERE singleton`;
    const launcher = await cloudLauncher();
    const guideReady = Boolean(
      event.guide_ready || (await launcher.approvedGuide()),
    );
    const operation = await launcher.start(randomUUID(), true);
    return Response.json({ operation, guideReady, model: judgeModelId });
  } catch (error) {
    return failure(error);
  }
}
