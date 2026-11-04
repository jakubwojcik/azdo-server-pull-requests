# Call the Azure DevOps REST API directly instead of using azure-devops-node-api

The official `azure-devops-node-api` SDK resolves endpoints through the location service, which fails on Azure DevOps Server (see ankitbko/vscode-pull-request-azdo issue #58) and drags in a large dependency tree. We call a dozen REST endpoints with Node `fetch`, Basic auth and an explicit `api-version`, which is what the one extension known to work on-prem (DHC) does.

## Consequences

- No typed client; we keep our own small set of response types.
