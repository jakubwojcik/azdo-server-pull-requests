import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClient, HttpError } from './client.ts';

function fakeFetch(status: number, body: unknown) {
  const requests: { url: string; headers: Headers }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(body), { status });
  };
  return { fetch, requests };
}

const log = { debug: () => {} };

test('connectionData calls the Collection without api-version, authenticated with the PAT', async () => {
  const user = { id: 'u1', providerDisplayName: 'Jane Doe' };
  const { fetch, requests } = fakeFetch(200, { authenticatedUser: user });
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection',
    'secret',
    '7.0',
    log,
    fetch,
  );

  const data = await client.connectionData();

  assert.deepEqual(data.authenticatedUser, user);
  assert.equal(
    requests[0].url,
    'https://tfs.example.com/tfs/DefaultCollection/_apis/connectionData',
  );
  assert.equal(requests[0].headers.get('authorization'), 'Basic OnNlY3JldA==');
});

test('a trailing slash on the Collection URL does not double the separator', async () => {
  const { fetch, requests } = fakeFetch(200, { authenticatedUser: {} });
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection/',
    'secret',
    '7.0',
    log,
    fetch,
  );

  await client.connectionData();

  assert.equal(
    requests[0].url,
    'https://tfs.example.com/tfs/DefaultCollection/_apis/connectionData',
  );
});

test('get sends the configured api-version alongside the query', async () => {
  const { fetch, requests } = fakeFetch(200, { value: [] });
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection',
    'secret',
    '6.0',
    log,
    fetch,
  );

  await client.get('_apis/git/pullrequests', {
    'searchCriteria.status': 'active',
  });

  assert.equal(
    requests[0].url,
    'https://tfs.example.com/tfs/DefaultCollection/_apis/git/pullrequests?searchCriteria.status=active&api-version=6.0',
  );
});

test('a rejected PAT surfaces as an HttpError with status 401', async () => {
  const { fetch } = fakeFetch(401, {});
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection',
    'expired',
    '7.0',
    log,
    fetch,
  );

  await assert.rejects(client.connectionData(), (error) => {
    assert.ok(error instanceof HttpError);
    assert.equal(error.status, 401);
    return true;
  });
});

test('getBytes requests plain content with the api-version and returns raw bytes', async () => {
  const requests: { url: string; headers: Headers }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response(new Uint8Array([0x68, 0x00, 0x69]));
  };
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection',
    'secret',
    '7.0',
    log,
    fetch,
  );

  const bytes = await client.getBytes('Shop/_apis/git/repositories/web/items', {
    path: '/a.png',
  });

  assert.deepEqual([...bytes], [0x68, 0x00, 0x69]);
  assert.equal(
    requests[0].url,
    'https://tfs.example.com/tfs/DefaultCollection/Shop/_apis/git/repositories/web/items?path=%2Fa.png&api-version=7.0',
  );
  assert.equal(requests[0].headers.get('accept'), 'text/plain');
});

test('send writes a JSON body with the api-version and returns the parsed reply', async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const fetch = async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify({ id: 7 }));
  };
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection',
    'secret',
    '7.0',
    log,
    fetch,
  );

  const reply = await client.send('POST', 'p1/_apis/threads', { status: 1 });

  assert.deepEqual(reply, { id: 7 });
  assert.equal(
    requests[0].url,
    'https://tfs.example.com/tfs/DefaultCollection/p1/_apis/threads?api-version=7.0',
  );
  assert.equal(requests[0].init?.method, 'POST');
  assert.equal(requests[0].init?.body, '{"status":1}');
  assert.equal(
    new Headers(requests[0].init?.headers).get('content-type'),
    'application/json',
  );
});

test('send resolves an empty reply to undefined', async () => {
  const fetch = async () => new Response(null, { status: 204 });
  const client = createClient(
    'https://tfs.example.com/tfs/DefaultCollection',
    'secret',
    '7.0',
    log,
    fetch,
  );

  assert.equal(await client.send('DELETE', 'p1/_apis/threads/1'), undefined);
});
