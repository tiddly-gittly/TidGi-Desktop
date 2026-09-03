export function getNodeWikiExtraPlugins(enableHTTPAPI: boolean, readOnlyMode?: boolean): string[] {
  return [
    readOnlyMode === true ? undefined : 'plugins/linonetwo/watch-filesystem-adaptor',
    'plugins/linonetwo/tidgi-ipc-syncadaptor',
    'plugins/linonetwo/tidgi-ipc-syncadaptor-ui',
    'plugins/linonetwo/memeloop-agent-ui',
    enableHTTPAPI ? 'plugins/tiddlywiki/filesystem' : undefined,
    enableHTTPAPI ? 'plugins/tiddlywiki/tiddlyweb' : undefined,
  ].filter(Boolean) as string[];
}
