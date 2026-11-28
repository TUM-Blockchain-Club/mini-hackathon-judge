import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { validateGuide } from './guide';
import { InputError } from '../lib/db';

const project = 'tbc-mini-hackathon-judge';
export const jobName = 'repo-judge-v1';
const jobUrl = `https://run.googleapis.com/v2/projects/${project}/locations/europe-west1/jobs/${jobName}`;
const audience =
  '//iam.googleapis.com/projects/60883640786/locations/global/workloadIdentityPools/vercel/providers/production';
export { judgeModelId } from './openai';

function signature(id: string, expiry: string, scope: string) {
  const key = process.env.ORGANIZER_PASSWORD;
  if (!key || key.length < 24)
    throw new InputError('Organizer access is not configured.', 503);
  return createHmac('sha256', key)
    .update(['cloud-judge-v1', scope, id, expiry].join('\0'))
    .digest();
}
export function issueTicket(id: string, scope = 'run') {
  const expiry = String(Date.now() + 16 * 60_000);
  return expiry + '.' + signature(id, expiry, scope).toString('hex');
}
export function verifyTicket(id: string, header: string | null, scope = 'run') {
  const match = /^Bearer (\d{13})\.([a-f0-9]{64})$/.exec(header || '');
  if (
    !match ||
    Number(match[1]) <= Date.now() ||
    !timingSafeEqual(
      signature(id, match[1], scope),
      Buffer.from(match[2], 'hex'),
    )
  )
    throw new InputError('Invalid or expired worker ticket.', 401);
}
export async function cloudLauncher() {
  const exchange = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      audience,
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      scope: 'https://www.googleapis.com/auth/cloud-platform',
      subjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
      subjectToken: await getVercelOidcToken(),
    }),
  });
  if (!exchange.ok)
    throw new InputError(
      'Google could not verify the Vercel production identity (' +
        exchange.status +
        ').',
      503,
    );
  const { access_token } = await exchange.json();
  const headers = {
    Authorization: 'Bearer ' + access_token,
    'Content-Type': 'application/json',
  };
  const response = await fetch(jobUrl, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new InputError(
      'Cloud Run job preflight failed (' + response.status + ').',
      503,
    );
  const job = await response.json();
  const container = job.template?.template?.containers?.[0];
  if (
    !container?.sandboxLauncher ||
    container.command?.length ||
    container.args?.length ||
    job.template.taskCount !== 1 ||
    !/@sha256:[a-f0-9]{64}$/.test(container.image) ||
    job.reconciling ||
    job.terminalCondition?.state !== 'CONDITION_SUCCEEDED'
  )
    throw new InputError('The pinned Cloud Run sandbox is not ready.', 503);
  return {
    snapshot: container.image as string,
    async approvedGuide() {
      const res = await fetch(
        'https://storage.googleapis.com/storage/v1/b/tbc-mini-hackathon-judge-private-guide-60883640786/o/approved-47e05abf0cf6.md?alt=media',
        {
          headers,
          cache: 'no-store',
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!res.ok)
        throw new InputError(
          'The approved private guide could not be loaded. Check storage access and retry.',
          503,
        );
      const guide = await res.text();
      if (
        createHash('sha256').update(guide).digest('hex') !==
        '47e05abf0cf666c0b8679b310d99d6aa070885d11f6f04f38960137417715697'
      )
        throw new InputError(
          'The private guide does not match the approved revision. Restore the approved file before starting.',
          409,
        );
      return validateGuide(guide);
    },
    async start(id: string, probe = false) {
      const env = [
        { name: 'JUDGE_RUN', value: id },
        {
          name: 'JUDGE_TICKET',
          value: issueTicket(id, probe ? 'probe' : 'run'),
        },
      ];
      if (probe) env.push({ name: 'JUDGE_PROBE', value: '1' });
      const result = await fetch(jobUrl + ':run', {
        method: 'POST',
        headers,
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          etag: job.etag,
          overrides: { containerOverrides: [{ env }] },
        }),
      });
      if (!result.ok)
        throw new InputError(
          'Google rejected dispatch (' + result.status + ').',
          503,
        );
      const operation = await result.json();
      if (operation.error || !operation.name)
        throw new InputError('Google did not accept the execution.', 503);
      return operation.name as string;
    },
  };
}
