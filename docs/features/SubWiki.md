# Sub-wiki Support

TidGi supports sub-wiki (child workspace) routing and management at several levels.

## Tiddler Routing

FileSystemAdaptor routes tiddlers to the correct sub-wiki based on tags or custom filters. Routing rules, in order of priority:

1. Direct tag match: tiddler tags match sub-wiki tagNames
2. Tag tree match: recursive tag hierarchy if includeTagTree is enabled
3. Custom filter: use fileSystemPathFilter expressions

These configs are editable by user using EditWorkspace's SubWiki section.

Tiddlers not matched to any sub-wiki are saved to the main workspace.

## File Watching

WatchFileSystemAdaptor reads the external attachment folder name from `$:/config/ExternalAttachments/WikiFolderToMove` (default `files`) and excludes this folder from watching. This prevents external attachments from being repeatedly created as tiddlers.

## External Attachments

tidgi-external-attachments plugin provides two key features:

Import-time routing:

- When importing files, tags in the import dialog are used to match sub-wikis
- Files are moved to the matched sub-wiki's files folder
- Tiddlers are saved to the corresponding sub-wiki

Tag change sync:

- When changing tags on an existing attachment tiddler, the file is automatically moved to the new sub-wiki
- _canonical_uri remains unchanged (relative path stays the same)
- Tiddler and file always stay in sync

## File Access

ipcServerRoutes.getFile() searches for files in order:

1. Main workspace's external attachment folder
2. Each sub-wiki's external attachment folder (in configured order)

This ensures that even if a tiddler's _canonical_uri points to the main workspace, but the file is actually in a sub-wiki, it will still be found.

## Configuration

All features use the same `$:/config/ExternalAttachments/WikiFolderToMove` config to determine the external attachment folder name, ensuring consistent behavior.
