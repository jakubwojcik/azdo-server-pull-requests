# Let the server re-anchor comment threads to the latest iteration

Threads created on an earlier iteration point at lines that may have moved after later pushes. We always request `threads?$iteration={latest}&$baseIteration=0`; the server returns `threadContext` already translated to the latest iteration (including renamed files) and keeps the original position in `pullRequestThreadContext.trackingCriteria`. Verified against Azure DevOps Server with api-version 7.0.

## Considered Options

- Mapping positions on the client by diffing iterations (what the GitHub PR extension and its Azure DevOps fork do): rejected in favour of server-side tracking.

## Consequences

- Threads the server cannot track are shown as file-level threads labelled outdated.
- The server marks such a thread with position line 0 and still fills `trackingCriteria` (verified 2026-11-06 on Azure DevOps Server, api-version 7.0: a thread on a line removed in a later iteration came back at `rightFileStart.line: 0`).
