/*\
title: $:/plugins/linonetwo/watch-fs/get-can-sync.js
type: application/javascript
module-type: route
GET /watch-fs-can-sync
\*/
(function () {
  exports.method = 'GET';

  // route should start with something https://github.com/Jermolene/TiddlyWiki5/issues/4807
  exports.path = /^\/linonetwo\/watch-fs-can-sync$/;

  exports.handler = function handler(request, response, state) {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    const { canSync } = state.wiki.watchFs;
    response.end(JSON.stringify(canSync), 'utf8');
  };
})();
