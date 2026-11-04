# Azure DevOps Server Pull Requests

VS Code extension for reviewing pull requests hosted on an on-prem Azure DevOps Server: listing the ones assigned to the current user, reading diffs, and discussing them in inline threads.

## Language

### Hosting

**Collection**:
The Azure DevOps Server project collection the extension talks to, identified by its URL. One collection per installation.
_Avoid_: Organization, org, instance

**Project**:
A team project inside the Collection. A Repository always belongs to exactly one Project.

**Repository**:
A git repository inside a Project. Pull Requests are grouped under their Repository in the tree.
_Avoid_: Repo (in prose), project (when the repository is meant)

### Pull Requests

**Pull Request**:
A request to merge a source branch into a target branch in one Repository. The extension shows only active ones.
_Avoid_: PR (in prose), merge request

**Draft**:
A Pull Request its author marked as not ready for review. Shown in the tree with a visible marker.
_Avoid_: WIP

**Reviewer**:
An identity listed directly on a Pull Request as someone expected to review it. Group membership does not make someone a Reviewer.

**Assigned Pull Request**:
A Pull Request on which the current user is a Reviewer. The tree lists only these.
_Avoid_: My PRs, PRs for me

**Vote**:
A Reviewer's stance on a Pull Request: Approve, Approve with suggestions, Wait for author, Reject, or no vote (reset).
_Avoid_: Review, approval

### Diffs

**Iteration**:
A snapshot of the Pull Request's source branch created on each push. The extension always works against the latest Iteration.
_Avoid_: Update, revision

**Base**:
The common ancestor commit of the source and target branches for the latest Iteration. Every diff is latest Iteration against Base.
_Avoid_: Merge base, target commit

**Change**:
One file added, edited, deleted or renamed between Base and the latest Iteration. Identified by its change tracking id within the Pull Request.
_Avoid_: Diff entry, file change

**Side**:
Which file version an Inline Thread or editor belongs to: Left is Base, Right is the latest Iteration.
_Avoid_: Original/modified, old/new

### Threads

**Thread**:
A conversation on a Pull Request made of one or more Comments. Has a Thread Status.
_Avoid_: Discussion, conversation

**Inline Thread**:
A Thread anchored to a line range of one file on one side of the diff. The server re-anchors it to the latest Iteration when asked.
_Avoid_: Code comment, line comment

**General Thread**:
A Thread on the Pull Request as a whole, not anchored to any file.
_Avoid_: PR comment, overview comment

**Comment**:
One authored message inside a Thread. The first Comment opens the Thread; the rest are replies.

**Thread Status**:
The state of a Thread: Active, Fixed, Won't fix, Closed, or Pending. Resolving a Thread sets it to Fixed; reactivating sets it to Active.
_Avoid_: Resolved (as a status name), state

**Like**:
A per-user endorsement of a single Comment.
_Avoid_: Reaction, upvote
