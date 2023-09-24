# Database Service

We have workspace level db, work as cache for tiddlers, and change logs (to record deletion, for sync deletion with mobile clients).

And we have app level db, to store things for pages like workflow pages. They are also regarded as temporary cache, and user can toggle a switch to store something inside cache to a wiki.

## App level DB

`src/services/database/entity` and `src/services/database/migration` are for app level db.
