# Database Service

We used to have workspace level db, work as cache for tiddlers, and change logs (to record deletion, for sync deletion with mobile clients).

But better-sqlite build failed for latest electron, and sqlite-vss is always not useable, so we drop support for sqlite.
