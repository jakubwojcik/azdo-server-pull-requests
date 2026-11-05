import type { LogOutputChannel } from 'vscode';

export interface Identity {
  id: string;
  providerDisplayName: string;
  customDisplayName?: string;
}

export interface ConnectionData {
  authenticatedUser: Identity;
}

export interface Repository {
  id: string;
  name: string;
  project: { id: string; name: string };
}

export interface PullRequest {
  pullRequestId: number;
  title: string;
  isDraft: boolean;
  createdBy: { displayName: string };
  repository: Repository;
  reviewers: { id: string; vote: number }[];
  sourceRefName: string;
  targetRefName: string;
}

export interface Change {
  changeTrackingId: number;
  changeType: string;
  item: { path: string; isFolder?: boolean };
  originalPath?: string;
}

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function createClient(
  collectionUrl: string,
  pat: string,
  apiVersion: string,
  log: Pick<LogOutputChannel, 'debug'>,
  fetchFn: typeof fetch = fetch,
) {
  const base = collectionUrl.replace(/\/+$/, '');
  const authorization = `Basic ${Buffer.from(`:${pat}`).toString('base64')}`;

  async function request(
    path: string,
    params: Record<string, string>,
    {
      method = 'GET',
      accept = 'application/json',
      body,
    }: { method?: string; accept?: string; body?: unknown } = {},
  ): Promise<Response> {
    const url = new URL(`${base}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const response = await fetchFn(url, {
      method,
      headers: {
        Authorization: authorization,
        Accept: accept,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    log.debug(`${method} ${url} ${response.status}`);
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `${method} ${url} failed: ${response.status} ${response.statusText}`,
      );
    }
    return response;
  }

  const withVersion = (params: Record<string, string>) => ({
    ...params,
    'api-version': apiVersion,
  });

  return {
    // connectionData rejects api-version=7.0 with 400 on Azure DevOps Server.
    connectionData: async () =>
      (await (
        await request('_apis/connectionData', {})
      ).json()) as ConnectionData,
    get: async <T>(path: string, params: Record<string, string> = {}) =>
      (await (await request(path, withVersion(params))).json()) as T,
    getBytes: async (path: string, params: Record<string, string>) =>
      new Uint8Array(
        await (
          await request(path, withVersion(params), { accept: 'text/plain' })
        ).arrayBuffer(),
      ),
    send: async (method: string, path: string, body?: unknown) => {
      const text = await (
        await request(path, withVersion({}), { method, body })
      ).text();
      return text ? (JSON.parse(text) as unknown) : undefined;
    },
    collectionUrl: base,
  };
}

export type AzdoClient = ReturnType<typeof createClient>;
