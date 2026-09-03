import path from 'path';

export const rendererAliases = [
  { find: '@', replacement: path.resolve(__dirname, './src') },
  { find: '@services', replacement: path.resolve(__dirname, './src/services') },
  // material-ui-cron publishes both ESM and CommonJS builds. Rolldown can pick
  // the CommonJS entry while following @memeloop/react-ui's scheduling entry,
  // which inlines a second React runtime and breaks hooks in packaged builds.
  { find: /^material-ui-cron$/, replacement: path.resolve(__dirname, './node_modules/material-ui-cron/dist/index.esm.js') },
  // Use exact public-entry aliases. A string alias for `/agent` also rewrites
  // `/agent/prompts` to `index.js/prompts`, which only fails in Rolldown's
  // production resolver after type-check and unit gates pass.
  { find: /^@memeloop\/react-ui\/chat$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/chat/index.js') },
  { find: /^@memeloop\/react-ui\/web$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/web/index.js') },
  { find: /^@memeloop\/react-ui\/native$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/native/index.js') },
  { find: /^@memeloop\/react-ui\/theme$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/theme/index.js') },
  { find: /^@memeloop\/react-ui\/agent\/prompts$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/agent/prompts/index.js') },
  { find: /^@memeloop\/react-ui\/agent\/scheduling$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/agent/scheduling/index.js') },
  { find: /^@memeloop\/react-ui\/agent$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/agent/index.js') },
  { find: /^@memeloop\/react-ui$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/index.js') },
  { find: 'react-transition-group/cjs/TransitionGroupContext.js', replacement: path.resolve(__dirname, './node_modules/react-transition-group/cjs/TransitionGroupContext.js') },
  { find: 'react-transition-group/esm/TransitionGroupContext.js', replacement: path.resolve(__dirname, './node_modules/react-transition-group/esm/TransitionGroupContext.js') },
];

/** Keep every renderer dependency on the same React dispatcher. */
export const rendererDedupe = ['react', 'react-dom'];
