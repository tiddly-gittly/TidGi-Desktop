import type { ToolDefinition } from 'memeloop';

import { alarmClockDefinition } from './alarmClock';
import { askQuestionDefinition } from './askQuestion';
import { backlinksDefinition } from './backlinks';
import { editAgentDefinitionDefinition } from './editAgentDefinition';
import { editTiddlerDefinition } from './editTiddler';
import { getErrorsDefinition } from './getErrors';
import { gitToolDefinition } from './git';
import { listTiddlersDefinition } from './listTiddlers';
import { mcpDefinition } from './modelContextProtocol';
import { recentDefinition } from './recent';
import { spawnAgentDefinition } from './spawnAgent';
import { summaryDefinition } from './summary';
import { tiddlyWikiPluginDefinition } from './tiddlywikiPlugin';
import { tocDefinition } from './toc';
import { todoDefinition } from './todo';
import { webFetchDefinition } from './webFetch';
import { wikiOperationDefinition } from './wikiOperation';
import { wikiSearchDefinition } from './wikiSearch';
import { workspacesListDefinition } from './workspacesList';
import { zxScriptDefinition } from './zxScript';

/** Pure definitions. Importing this module never mutates a Core registry. */
export const desktopBuiltinToolDefinitions: readonly ToolDefinition[] = Object.freeze([
  wikiSearchDefinition,
  wikiOperationDefinition,
  workspacesListDefinition,
  gitToolDefinition,
  tiddlyWikiPluginDefinition,
  mcpDefinition,
  summaryDefinition,
  alarmClockDefinition,
  editAgentDefinitionDefinition,
  askQuestionDefinition,
  backlinksDefinition,
  tocDefinition,
  recentDefinition,
  listTiddlersDefinition,
  getErrorsDefinition,
  zxScriptDefinition,
  webFetchDefinition,
  spawnAgentDefinition,
  editTiddlerDefinition,
  todoDefinition,
]);
