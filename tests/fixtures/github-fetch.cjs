// Loaded only in the isolated browser rehearsal's Next server.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const original = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = input.url || String(input);
  if (url === 'https://codeload.github.com/example/project/zip/HEAD')
    return Promise.resolve(new Response(readFileSync(join(__dirname, 'github-head.zip'))));
  return original(input, options);
};
