import { createHash } from 'node:crypto';
import { fromBuffer, type Entry } from 'yauzl';
import { InputError } from './db';

export const uploadLimit = 3 * 1024 * 1024;
const repositoryLimit = 24 * 1024 * 1024;
export const accepted = '.zip,.xlsx,.docx,.pdf,.md,.txt,.csv,.json,.py,.js';
export const digest = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex');

async function checkArchive(bytes: Buffer, ext: string) {
  return new Promise<void>((resolve, reject) => {
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
          const required =
            ext === 'xlsx'
              ? 'xl/workbook.xml'
              : ext === 'docx'
                ? 'word/document.xml'
                : null;
          if (
            !Array.from(names).some((n) => !n.endsWith('/')) ||
            (required && !names.has(required))
          )
            return fail();
          resolve();
        });
        zip.readEntry();
      },
    );
  });
}
export async function inspectFile(filename: string, bytes: Buffer) {
  if (!bytes.length) throw new InputError('The file is empty.');
  if (!/^[^/\\\x00-\x1f]{1,160}$/.test(filename) || filename.startsWith('-'))
    throw new InputError('Use a simple filename.');
  const ext = filename.split('.').at(-1)?.toLowerCase() ?? '';
  if (!accepted.split(',').includes('.' + ext))
    throw new InputError('Choose a supported file type or a ZIP archive.');
  if (['zip', 'docx', 'xlsx'].includes(ext)) await checkArchive(bytes, ext);
  else if (ext === 'pdf' && bytes.subarray(0, 5).toString() !== '%PDF-')
    throw new InputError('The PDF header is invalid.');
}
export async function capture(form: FormData) {
  let bytes: Buffer, filename: string, source: string;
  if (form.get('method') === 'github') {
    const url = String(form.get('commit') ?? '').trim();
    const match =
      /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/commit\/([a-f0-9]{40})\/?$/i.exec(
        url,
      );
    if (!match || match.slice(1, 3).some((v) => v === '.' || v === '..'))
      throw new InputError(
        'Paste the public GitHub commit URL with its full 40-character SHA.',
      );
    const [, owner, repo, sha] = match;
    const response = await fetch(
      `https://codeload.github.com/${owner}/${repo}/zip/${sha}`,
      { redirect: 'error', signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok || !response.body)
      throw new InputError(
        'Could not download that public commit. For a private repository, upload a ZIP.',
      );
    const reader = response.body.getReader(),
      chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if ((size += value.length) > repositoryLimit) {
        await reader.cancel();
        throw new InputError(
          'Repository archive exceeds 24 MiB. Upload the deliverables separately as a ZIP.',
        );
      }
      chunks.push(value);
    }
    bytes = Buffer.concat(chunks);
    filename = 'submission.zip';
    source = url;
  } else {
    const file = form.get('file');
    if (!(file instanceof File) || file.size > uploadLimit)
      throw new InputError('Choose a file up to 3 MiB.');
    bytes = Buffer.from(await file.arrayBuffer());
    filename = file.name;
    source = 'upload';
  }
  await inspectFile(filename, bytes);
  return { bytes, filename, source, hash: digest(bytes) };
}
