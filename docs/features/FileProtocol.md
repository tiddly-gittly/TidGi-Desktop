# FileProtocol

## Click the link

Normally, link like

```wikitext
[ext[外部文件|file:///Users/linonetwo/Downloads/(OCRed)奖励的惩罚 (（美）科恩著) (Z-Library).pdf]]

[ext[外部文件夹|file:///Users/linonetwo/Downloads/]]
```

Will become external link that will open new window, so this feature is handled in `handleOpenFileExternalLink` in `src/services/view/setupViewFileProtocol.ts`.

## Load the file content

Image syntax like

```wikitext
[img[file://./files/1644384970572.jpeg]]
```

will ask `view.webContent` to send a request, which will be handled in `handleViewFileContentLoading` in `src/services/view/setupViewFileProtocol.ts`, we use `onBeforeRequest` to catch this request.

If the url in the request is absolute, we just let `webContent` load it as normal. We use `callback({ cancel: false });` to hand back control to `webContent`.

If it is relative to workspace path, we use `nativeService.formatFileUrlToAbsolutePath(details.url)` to get the absolute path, and pass it to `redirectURL` to ask ``webContent` to load this new absolute path.

### Deprecated ways

#### `protocol.handle('filefix')`

This implementation is buggy, that will crash app when loading pdf.

```ts
const fileTypeThatWillCrash = new Set(['.pdf']);
async function loadFileContentHandler(request: Request) {
  let { pathname } = new URL(request.url);
  pathname = decodeURIComponent(pathname);
  logger.info(`Loading file content from ${pathname}`, { function: 'handleViewFileContentLoading view.webContents.session.protocol.handle' });
  try {
    // mimeType will be `text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7` so is useless, `contentType` will also be `null`
    // const mimeType = request.headers.get('accept');
    // const contentType = request.headers.get('Content-Type');
    const extname = path.extname(pathname);
    if (fileTypeThatWillCrash.has(extname)) {
      return new Response(undefined, { status: 500, statusText: `${extname} will crash electron, prevented loading.` });
    }
    const response = await net.fetch(pathToFileURL(pathname).toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
      bypassCustomProtocolHandlers: true,
    });
    logger.info(`${pathname} loaded`, { function: 'handleViewFileContentLoading view.webContents.session.protocol.handle' });
    return response;
  } catch (error) {
    return new Response(undefined, { status: 404, statusText: (error as Error).message });
  }
}

  try {
    /**
     * This function is called for every view, but seems register on two different view will throw error, so we check if it's already registered.
     */
    if (!view.webContents.session.protocol.isProtocolHandled('filefix')) {
      /**
       * Electron's bug, file protocol is not handle-able, won't get any callback. But things like `filea://` `filefix` works.
       */
      view.webContents.session.protocol.handle('filefix', loadFileContentHandler);
    }
    /**
     * Alternative `open://` protocol for a backup if `file://` doesn't work for some reason.
     */
    if (!view.webContents.session.protocol.isProtocolHandled('open')) {
      view.webContents.session.protocol.handle('open', loadFileContentHandler);
    }
  } catch (error) {
    logger.error(`Failed to register protocol: ${(error as Error).message}`, { function: 'handleViewFileContentLoading' });
  }
```

#### `protocol.handle('file')`

`protocol.handle('file'`'s handler won't receive anything.

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

works. But currently it is not.