Feature: Git Sync
  As a user
  I want to sync my wiki to a remote repository
  So that I can backup and share my content

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"

  @git @sync
  Scenario: Sync to local remote repository via application menu (commit and push)
    # Setup a bare git repository as local remote
    When I create a bare git repository at "{tmpDir}/remote-repo-menu.git"
    # Configure sync via edit workspace window
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on "saveAndSyncOptions accordion and syncToCloud toggle" elements with selectors:
      | element description         | selector                                              |
      | saveAndSyncOptions accordion| [data-testid='preference-section-saveAndSyncOptions'] |
      | syncToCloud toggle          | [data-testid='synced-local-workspace-switch']         |
    And I wait for 1 seconds
    When I type in "git url input and github username input and github email input and github token input" elements with selectors:
      | text                              | selector                                                                                                                                                     |
      | {tmpDir}/remote-repo-menu.git     | label:has-text('Git仓库线上网址') + * input, label:has-text('Git Repo URL') + * input, input[aria-label='Git仓库线上网址'], input[aria-label='Git Repo URL'] |
      | testuser                          | [data-testid='github-userName-input'] input                                                                                                                  |
      | testuser@example.com              | [data-testid='github-email-input'] input                                                                                                                     |
      | test-token-12345                  | [data-testid='github-token-input'] input                                                                                                                     |
    When I click on a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    # Wait for workspace to be saved (workspace.update triggers a restart which takes time)
    And I wait for 5 seconds
    When I switch to "main" window
    # Create a new tiddler to trigger sync
    When I create file "{tmpDir}/wiki/tiddlers/SyncMenuTestTiddler.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: SyncMenuTestTiddler
      tags: SyncTest
      
      This is a test tiddler for sync via menu feature.
      """
    Then I wait for tiddler "SyncMenuTestTiddler" to be added by watch-fs
    # Clear previous test markers to ensure we're testing fresh sync operation
    When I clear test-id markers from logs
    # Use application menu to sync (commit and push)
    When I click menu "知识库 > 立即同步云端"
    # Wait for git sync to complete (not just commit)
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    # Verify the commit was pushed to remote by cloning the remote and checking
    Then the remote repository "{tmpDir}/remote-repo-menu.git" should contain commit with message "使用太记桌面版备份"
    And the remote repository "{tmpDir}/remote-repo-menu.git" should contain file "tiddlers/SyncMenuTestTiddler.tid"
