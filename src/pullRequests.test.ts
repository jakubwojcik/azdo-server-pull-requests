import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PullRequest } from './client.ts';
import { groupByRepository } from './pullRequests.ts';

function pullRequest(
  pullRequestId: number,
  repository: string,
  project = 'Platform',
): PullRequest {
  return {
    pullRequestId,
    title: `Pull Request ${pullRequestId}`,
    isDraft: false,
    createdBy: { displayName: 'Jane Doe' },
    repository: {
      id: `${project}/${repository}`,
      name: repository,
      project: { name: project },
    },
    reviewers: [],
    sourceRefName: 'refs/heads/feature',
    targetRefName: 'refs/heads/main',
  };
}

test('Pull Requests are grouped under their Repository', () => {
  const groups = groupByRepository([
    pullRequest(1, 'web'),
    pullRequest(2, 'api'),
    pullRequest(3, 'web'),
  ]);

  assert.deepEqual(
    groups.map((group) => [
      group.repository.name,
      group.pullRequests.map((pr) => pr.pullRequestId),
    ]),
    [
      ['api', [2]],
      ['web', [3, 1]],
    ],
  );
});

test('Pull Requests within a Repository are listed newest first', () => {
  const [group] = groupByRepository([
    pullRequest(7, 'web'),
    pullRequest(42, 'web'),
    pullRequest(15, 'web'),
  ]);

  assert.deepEqual(
    group.pullRequests.map((pr) => pr.pullRequestId),
    [42, 15, 7],
  );
});

test('same-named Repositories in different Projects stay apart, ordered by Project', () => {
  const groups = groupByRepository([
    pullRequest(1, 'web', 'Sales'),
    pullRequest(2, 'web', 'Billing'),
  ]);

  assert.deepEqual(
    groups.map((group) => group.repository.project.name),
    ['Billing', 'Sales'],
  );
});
