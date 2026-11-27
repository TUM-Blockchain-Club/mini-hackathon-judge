import { InputError } from './db';
export function failure(err: unknown) {
  if (err instanceof InputError)
    return Response.json({ error: err.message }, { status: err.status });
  console.error('Request failed:', err instanceof Error ? err.name : 'unknown');
  return Response.json(
    {
      error:
        'The event service is unavailable. Try again or contact an organizer.',
    },
    { status: 503 },
  );
}
