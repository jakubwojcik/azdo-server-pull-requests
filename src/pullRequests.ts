import type { PullRequest, Repository } from './client.ts';

export interface RepositoryGroup {
  repository: Repository;
  pullRequests: PullRequest[];
}

export function groupByRepository(
  pullRequests: PullRequest[],
): RepositoryGroup[] {
  const groups = new Map<string, RepositoryGroup>();
  for (const pullRequest of pullRequests) {
    const { repository } = pullRequest;
    const group = groups.get(repository.id) ?? { repository, pullRequests: [] };
    group.pullRequests.push(pullRequest);
    groups.set(repository.id, group);
  }
  for (const group of groups.values()) {
    group.pullRequests.sort((a, b) => b.pullRequestId - a.pullRequestId);
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.repository.name.localeCompare(b.repository.name) ||
      a.repository.project.name.localeCompare(b.repository.project.name),
  );
}
