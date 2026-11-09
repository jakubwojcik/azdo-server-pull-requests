# Manual test checklist

Run against the real Collection before a release: press F5 in this repo, then "Azure DevOps Server: Configure Collection" in the Extension Development Host. Pick a Pull Request with several Iterations, a renamed file and existing Threads. After code changes reload with Cmd+Shift+F5 and reopen the file.

## Tree

- [ ] Pull Requests are grouped under their Repository, with the Project in the description.
- [ ] Drafts show the `[Draft]` prefix and have no Vote actions.
- [ ] The description is `!id · author`; the icon colour and the badge at the end of the row (✓ Approved or Approved with suggestions, … Waiting for author, ✗ Rejected, none for no vote) match your own Vote.
- [ ] Each Change shows a badge with the number of active Threads (Active and Pending); it drops after Resolve.

## Diff

- [ ] An edited file shows the same diff as the web Files tab.
- [ ] A renamed file shows the old version on the Left, not a 404.
- [ ] An added file opens the Right Side only, a deleted file the Left Side only.
- [ ] The Previous Thread and Next Thread buttons in the editor title bar jump between Threads in the focused Side.
- [ ] A binary file shows "Binary file not shown" with a link to the web.

## Existing Threads

- [ ] A Thread from the latest Iteration sits on the same line and Side as in the web.
- [ ] A Thread from an older Iteration sits on the re-anchored line.
- [ ] A Thread on a line removed later shows as a file-level Thread labelled `Outdated` (server returns line 0, see ADR-0002).
- [ ] A Thread created in the web on the whole file (no line) shows as a file-level Thread without `Outdated`.
- [ ] Comments show author, time, `edited` and `Liked by ...`; the reply box starts collapsed as "Reply...".
- [ ] Resolved Threads (Fixed, Won't fix, Closed, By design) start collapsed.

## Writing Threads

- [ ] A new Thread on the Right Side appears in the web on the same line.
- [ ] A new Thread on the Left Side appears in the web on the same line and Side.
- [ ] Reply, edit (save and cancel) and delete with confirmation are reflected in the web.
- [ ] Edit and delete appear only on your own Comments.
- [ ] Resolve, Reactivate and Change Status are reflected in the web and in the Thread label.
- [ ] Like and unlike are reflected in the web; the icon switches between outline and filled.

## Pull Request actions

- [ ] Approve, Approve with suggestions, Wait for author, Reject and Reset vote are reflected in the web and in the tree colour.
- [ ] As a required Reviewer, voting keeps the "required" flag.
- [ ] Start General Thread posts a Thread visible in the web Overview.
- [ ] Open in Browser and Copy URL use the Pull Request web URL.
- [ ] Refresh works from the title button, the command and when the view becomes visible.

## Errors

- [ ] A wrong PAT shows "The Collection rejected the PAT." with Update PAT.
- [ ] With the log level set to Debug, the Output panel "Azure DevOps Server Pull Requests" logs each request without the PAT.
