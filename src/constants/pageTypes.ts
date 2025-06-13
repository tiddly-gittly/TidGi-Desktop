export enum PageType {
  /**
   * Default empty page, have some user guide and new user settings.
   */
  guide = 'guide',
  /**
   * Show list of available help resources to learn TiddlyWiki.
   */
  help = 'help',
  /**
   * All "workspaces". It is hard to merge workspace concept with page concept, because will need to migrate all user data. So we leave them to be still workspace, but also call them wiki pages. And in event listeners about wiki page, we redirect them to call workspace methods.
   */
  wiki = 'wiki',
  /**
   * Chat page for AI agents.
   */
  agent = 'agent',
  /**
   * Special page type for the "add workspace" button.
   */
  add = 'add',
}
