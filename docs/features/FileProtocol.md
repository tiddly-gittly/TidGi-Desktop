# FileProtocol

## Click the link

Normally, link like

```wikitext
[ext[外部文件|file:///Users/linonetwo/Downloads/(OCRed)奖励的惩罚 (（美）科恩著) (Z-Library).pdf]]

[ext[外部文件夹|file:///Users/linonetwo/Downloads/]]
```

Will become external link that will open new window, so this feature is handled in `handleOpenFileExternalLink` in `src/services/view/setupViewEventHandlers.ts`.

## Load the file content

Image syntax like

```wikitext
[img[file://./files/1644384970572.jpeg]]
```

will ask `view.webContent` to send a request, which will be handled in `handleFileProtocol` in `src/services/view/setupViewSession.ts`.

We can switch to this

```ts
  public async handleFileProtocol(request: GlobalRequest): Promise<GlobalResponse> {
    logger.info('handleFileProtocol() getting url', { url: request.url });
    const { pathname } = new URL(request.url);
    logger.info('handleFileProtocol() handle file:// or open:// This url will open file in-wiki', { pathname });
    let fileExists = fs.existsSync(pathname);
    logger.info(`This file (decodeURI) ${fileExists ? '' : 'not '}exists`, { pathname });
    if (fileExists) {
      return await net.fetch(pathname);
    }
    logger.info(`try find file relative to workspace folder`);
    const workspace = await this.workspaceService.getActiveWorkspace();
    if (workspace === undefined) {
      logger.error(`No active workspace, abort. Try loading pathname as-is.`, { pathname });
      return await net.fetch(pathname);
    }
    const filePathInWorkspaceFolder = path.resolve(workspace.wikiFolderLocation, pathname);
    fileExists = fs.existsSync(filePathInWorkspaceFolder);
    logger.info(`This file ${fileExists ? '' : 'not '}exists in workspace folder.`, { filePathInWorkspaceFolder });
    if (fileExists) {
      return await net.fetch(filePathInWorkspaceFolder);
    }
    logger.info(`try find file relative to TidGi App folder`);
    // on production, __dirname will be in .webpack/main
    const inTidGiAppAbsoluteFilePath = path.join(app.getAppPath(), '.webpack', 'renderer', pathname);
    fileExists = fs.existsSync(inTidGiAppAbsoluteFilePath);
    if (fileExists) {
      return await net.fetch(inTidGiAppAbsoluteFilePath);
    }
    logger.warn(`This url can't be loaded in-wiki. Try loading url as-is.`, { url: request.url });
    return await net.fetch(request.url);
  }
```

if

```ts
await app.whenReady();
protocol.handle('file', nativeService.handleFileProtocol.bind(nativeService));
```

works. But currently it is not. `protocol.handle('file'`'s handler won't receive anything.