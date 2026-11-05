# Azure DevOps Server Pull Requests

Review pull requests on an on-premises Azure DevOps Server from VS Code.

This is an independent project. It is not affiliated with or supported by Microsoft.

## Getting started

1. Open the Azure DevOps Server Pull Requests view in the activity bar.
2. Run `Configure Collection` and enter the Collection URL (e.g. `https://tfs.example.com/tfs/DefaultCollection`) and a Personal Access Token with the Code (Read & Write) scope.
3. The `Azure DevOps Server Pull Requests` output channel shows who you are signed in as.

Use `Update PAT` when the token expires and `Sign out` to remove it.

## Settings

| Setting                                | Default | Description                               |
| -------------------------------------- | ------- | ----------------------------------------- |
| `azdoServerPullRequests.collectionUrl` |         | URL of the Collection.                    |
| `azdoServerPullRequests.apiVersion`    | `7.0`   | REST api-version sent with every request. |

The PAT is kept in VS Code SecretStorage.

## Credits

- [azdo-pull-request](https://github.com/damhau/azdo-pull-request) by Damien Hauser (MIT).
- [vscode-pull-request-azdo](https://github.com/ankitbko/vscode-pull-request-azdo), a fork of Microsoft's [vscode-pull-request-github](https://github.com/microsoft/vscode-pull-request-github) (MIT).

See [ThirdPartyNotices.md](ThirdPartyNotices.md).

## License

[MIT](LICENSE)
