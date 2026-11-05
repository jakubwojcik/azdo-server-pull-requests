export const DIFF_SCHEME = 'azdo-server-pr';

export interface FileVersion {
  project: string;
  repository: string;
  pullRequestId: number;
  commit: string;
  path: string;
}

export function encodeDiffUri({ path, ...rest }: FileVersion) {
  const query = new URLSearchParams({
    ...rest,
    pullRequestId: String(rest.pullRequestId),
  });
  return { scheme: DIFF_SCHEME, path, query: query.toString() };
}

export function decodeDiffUri(uri: {
  path: string;
  query: string;
}): FileVersion {
  const query = new URLSearchParams(uri.query);
  return {
    project: query.get('project') ?? '',
    repository: query.get('repository') ?? '',
    pullRequestId: Number(query.get('pullRequestId')),
    commit: query.get('commit') ?? '',
    path: uri.path,
  };
}

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export function fileContent(bytes: Uint8Array, webUrl: string): string {
  if (bytes.length > MAX_FILE_BYTES) {
    return `File larger than ${MAX_FILE_BYTES / 1024 / 1024} MB not shown. Open it in the browser: ${webUrl}`;
  }
  // ponytail: NUL-byte sniff like git; non-UTF-8 text encodings are decoded as UTF-8.
  if (bytes.subarray(0, 8000).includes(0)) {
    return `Binary file not shown. Open it in the browser: ${webUrl}`;
  }
  return new TextDecoder().decode(bytes);
}
