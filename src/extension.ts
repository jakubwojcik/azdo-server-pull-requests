import * as vscode from 'vscode';
import { createClient, HttpError } from './client.ts';

const SECTION = 'azdoServerPullRequests';
const PAT_KEY = `${SECTION}.pat`;

export function activate(context: vscode.ExtensionContext) {
  const log = vscode.window.createOutputChannel(
    'Azure DevOps Server Pull Requests',
    { log: true },
  );
  let generation = 0;

  async function signIn() {
    const current = ++generation;
    const config = vscode.workspace.getConfiguration(SECTION);
    const collectionUrl = config.get<string>('collectionUrl', '');
    const apiVersion = config.get<string>('apiVersion', '7.0');
    const pat = await context.secrets.get(PAT_KEY);
    if (current !== generation) return;

    const unconfigured = !collectionUrl || !pat;
    await vscode.commands.executeCommand(
      'setContext',
      `${SECTION}.unconfigured`,
      unconfigured,
    );
    if (unconfigured) {
      log.info('Collection URL or PAT not configured');
      return;
    }

    const client = createClient(collectionUrl, pat, apiVersion, log);
    try {
      const { authenticatedUser: user } = await client.connectionData();
      if (current !== generation) return;
      log.info(
        `Signed in as ${user.customDisplayName ?? user.providerDisplayName}`,
      );
    } catch (error) {
      if (current !== generation) return;
      const cause = (error as Error).cause as NodeJS.ErrnoException | undefined;
      const message =
        error instanceof Error
          ? `${error.message}${cause ? ` (${cause.code ?? cause.message})` : ''}`
          : String(error);
      log.error(message);
      if (error instanceof HttpError && error.status === 401) {
        const action = await vscode.window.showErrorMessage(
          'The Collection rejected the PAT.',
          'Update PAT',
        );
        if (action) await updatePat();
      } else {
        const action = await vscode.window.showErrorMessage(
          `Could not sign in to the Collection: ${message}`,
          'Show log',
        );
        if (action) log.show();
      }
    }
  }

  async function promptPat() {
    return vscode.window.showInputBox({
      title: 'Personal Access Token',
      prompt: 'PAT with Code (Read & Write) scope',
      password: true,
      ignoreFocusOut: true,
    });
  }

  async function updatePat() {
    const pat = await promptPat();
    if (pat) await context.secrets.store(PAT_KEY, pat);
  }

  async function configureCollection() {
    const config = vscode.workspace.getConfiguration(SECTION);
    const collectionUrl = await vscode.window.showInputBox({
      title: 'Collection URL',
      value: config.get<string>('collectionUrl', ''),
      placeHolder: 'https://tfs.example.com/tfs/DefaultCollection',
      ignoreFocusOut: true,
      validateInput: (value) =>
        URL.canParse(value) && /^https?:$/.test(new URL(value).protocol)
          ? undefined
          : 'Enter an http(s) URL',
    });
    if (!collectionUrl) return;
    const pat = await promptPat();
    if (!pat) return;
    await config.update(
      'collectionUrl',
      collectionUrl,
      vscode.ConfigurationTarget.Global,
    );
    await context.secrets.store(PAT_KEY, pat);
  }

  context.subscriptions.push(
    log,
    vscode.window.registerTreeDataProvider(`${SECTION}.assigned`, {
      getChildren: () => [],
      getTreeItem: (item: vscode.TreeItem) => item,
    }),
    vscode.commands.registerCommand(
      `${SECTION}.configureCollection`,
      configureCollection,
    ),
    vscode.commands.registerCommand(`${SECTION}.updatePat`, updatePat),
    vscode.commands.registerCommand(`${SECTION}.signOut`, () =>
      context.secrets.delete(PAT_KEY),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) void signIn();
    }),
    context.secrets.onDidChange((event) => {
      if (event.key === PAT_KEY) void signIn();
    }),
  );

  void signIn();
}
