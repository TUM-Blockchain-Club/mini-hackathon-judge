import { createHash } from 'node:crypto';
import { fromBuffer, type Entry } from 'yauzl';
import { InputError } from './db';

const repositoryLimit = 24 * 1024 * 1024;
export const digest = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex');

async function archiveCommit(bytes: Buffer) {
  return new Promise<string>((resolve, reject) => {
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          return reject(new InputError('The archive could not be opened.'));
        let size = 0,
          count = 0;
        const names = new Set<string>();
        const fail = () => {
          zip.close();
          reject(
            new InputError(
              'Invalid or oversized archive. Use up to 2,500 files and 96 MiB unpacked.',
            ),
          );
        };
        zip.on('error', fail);
        zip.on('entry', (entry: Entry) => {
          size += entry.uncompressedSize;
          const mode = entry.externalFileAttributes >>> 16;
          if (
            ++count > 2500 ||
            size > 96 * 1024 * 1024 ||
            entry.isEncrypted() ||
            (mode & 0o170000) === 0o120000 ||
            names.has(entry.fileName) ||
            /[\x00-\x1f]/.test(entry.fileName)
          )
            return fail();
          names.add(entry.fileName);
          if (entry.fileName.endsWith('/')) return zip.readEntry();
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) return fail();
            stream
              .on('error', fail)
              .once('end', () => zip.readEntry())
              .resume();
          });
        });
        zip.once('end', () => {
          if (!Array.from(names).some((n) => !n.endsWith('/')) ||
              !/^[0-9a-f]{40}$/.test(zip.comment))
            return fail();
          resolve(zip.comment);
        });
        zip.readEntry();
      },
    );
  });
}
export async function capture(form: FormData) {
  if (form.has('file') || (form.has('method') && form.get('method') !== 'github'))
    throw new InputError('Submit a public GitHub repository link.');
  const link = String(form.get('repository') ?? '').trim();
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,104})\/?$/i.exec(link);
  const repo = match?.[2].replace(/\.git$/i, '');
  if (!match || !repo || repo === '.' || repo === '..')
    throw new InputError('Use the repository link, such as https://github.com/team/project.');
  const path = match[1] + '/' + repo;
  // GitHub writes the resolved commit SHA into its ZIP archive comment.
  const response = await fetch('https://codeload.github.com/' + path + '/zip/HEAD', {
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok || !response.body)
    throw new InputError('Could not download the repository. Check that it is public and has a commit on its default branch.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > repositoryLimit) {
      await reader.cancel();
      throw new InputError('The repository archive must be 24 MiB or smaller.');
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks);
  const sha = await archiveCommit(bytes);
  return { bytes, filename: 'submission.zip', source: 'https://github.com/' + path + '/commit/' + sha, hash: digest(bytes) };
}
