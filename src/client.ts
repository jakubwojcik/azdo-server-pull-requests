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

  async function send<T>(
    path: string,
    params: Record<string, string> = {},
  ): Promise<T> {
    const url = new URL(`${base}/${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    const response = await fetchFn(url, {
      headers: { Authorization: authorization, Accept: 'application/json' },
    });
    log.debug(`GET ${url} ${response.status}`);
    if (!response.ok) {
      throw new HttpError(
        response.status,
        `GET ${url} failed: ${response.status} ${response.statusText}`,
      );
    }
    return (await response.json()) as T;
  }

  return {
    // connectionData rejects api-version=7.0 with 400 on Azure DevOps Server.
    connectionData: () => send<ConnectionData>('_apis/connectionData'),
    get: <T>(path: string, params: Record<string, string> = {}) =>
      send<T>(path, { ...params, 'api-version': apiVersion }),
  };
}

export type AzdoClient = ReturnType<typeof createClient>;
