import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeDiffUri, encodeDiffUri, fileContent } from './diff.ts';

test('a file version survives encoding into a URI and back', () => {
  const version = {
    project: 'Shop & Billing',
    repository: 'web app',
    pullRequestId: 42,
    commit: '3f2a9c1e',
    path: '/src/a b/#100%?.ts',
  };

  const uri = encodeDiffUri(version);

  assert.equal(uri.path, version.path);
  assert.deepEqual(decodeDiffUri(uri), version);
});

const webUrl = 'https://tfs.example.com/tfs/C/Shop/_git/web/pullrequest/42';

test('text files are shown as text', () => {
  const bytes = new TextEncoder().encode('const zażółć = 1;\n');

  assert.equal(fileContent(bytes, webUrl), 'const zażółć = 1;\n');
});

test('binary files show a message with a web link instead of their bytes', () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x1a]);

  assert.equal(
    fileContent(bytes, webUrl),
    `Binary file not shown. Open it in the browser: ${webUrl}`,
  );
});

test('oversized files show a message with a web link instead of their text', () => {
  const bytes = new Uint8Array(5 * 1024 * 1024 + 1).fill(0x61);

  assert.equal(
    fileContent(bytes, webUrl),
    `File larger than 5 MB not shown. Open it in the browser: ${webUrl}`,
  );
});
