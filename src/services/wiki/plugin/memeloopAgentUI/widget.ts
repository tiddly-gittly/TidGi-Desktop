/* eslint-disable @typescript-eslint/no-require-imports */

// This plugin is also loaded by the Node.js wiki worker. Keep all React and
// browser-only dependencies behind the browser guard.
if ($tw.browser) {
  const components = require('$:/plugins/linonetwo/memeloop-agent-ui/components.js') as {
    MemeLoopAgentChatWidget: unknown;
  };
  const pluginExports = module.exports as Record<string, unknown>;
  pluginExports.memeloopAgentChat = components.MemeLoopAgentChatWidget;
}
