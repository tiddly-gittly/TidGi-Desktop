Feature: TidGi Default Wiki
  As a user
  I want app auto create a default wiki workspace for me
  So that I can start using wiki immediately

  @wiki @create-main-workspace @root-tiddler
  Scenario: Default wiki content, create new workspace, and configure root tiddler
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely

    # --- Part 1: Verify default wiki workspace with TiddlyWiki content ---
    Then I should see "page body and wiki workspace" elements with selectors:
      | element description | selector                                        |
      | page body           | body                                            |
      | wiki workspace      | div[data-testid^='workspace-']:has-text('wiki') |
    And the window title should contain "太记"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content

    # --- Part 2: Create new main workspace via UI from top sidebar ---
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    Then I should see "create new wiki tab and main/sub workspace switch" elements with selectors:
      | element description           | selector                                  |
      | create new wiki tab           | button:has-text('创建新知识库')           |
      | main/sub workspace switch     | [data-testid='main-sub-workspace-switch'] |
    When I clear text in "wiki folder name input" element with selector "label:has-text('即将新建的知识库文件夹名') + div input"
    When I type "wiki2" in "wiki folder name input" element with selector "label:has-text('即将新建的知识库文件夹名') + div input"
    When I click on a "create wiki button" element with selector "button:has-text('创建知识库')"
    Then I wait for "workspace created" log marker "[test-id-WORKSPACE_CREATED]"
    When I switch to "main" window
    Then I should see a "wiki2 workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki2')"
    When I click on a "wiki2 workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki2')"
    And the browser view should be loaded and visible
    Then I should see "我的 TiddlyWiki" in the browser view content

    # --- Part 3: Configure root tiddler to use lazy-load ---
    # Switch back to default wiki workspace (exclude wiki2 match)
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki'):not(:has-text('wiki2'))"
    And the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
    When I modify file "wiki-test/wiki/tiddlers/Index.tid" to contain "Test content for lazy-all verification after restart"
    And I should not see "Test content for lazy-all verification after restart" in the browser view content
    When I update workspace "wiki" settings:
      | property              | value                 |
      | rootTiddler           | $:/core/save/lazy-all |
      | enableFileSystemWatch | false                 |
    Then I wait for "config file written" log marker "[test-id-TIDGI_CONFIG_WRITTEN]"
    When I restart workspace "wiki"
    And the browser view should be loaded and visible
    # In lazy-all mode, Index.tid is served via tidgi:// protocol. Opening it confirms lazy-load works.
    When I open tiddler "Index" in browser view
    Then I should see a "Index tiddler" element in browser view with selector "div[data-tiddler-title='Index']"


  @wiki @move-workspace
  Scenario: Move workspace to a new location
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And the browser view should be loaded and visible
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on a "save and sync options accordion" element with selector "[data-testid='preference-section-saveAndSync']"
    Then I should see a "move workspace button" element with selector "button:has-text('移动工作区')"
    # Test the actual move operation - this will trigger a file dialog
    When I prepare to select directory in dialog "wiki-test-moved"
    And I click on a "move workspace button" element with selector "button:has-text('移动工作区')"
    Then I wait for log markers:
      | description                        | marker                                   |
      | workspace moved to wiki-test-moved | [test-id-WORKSPACE_MOVED:                |
      | workspace restarted after move     | [test-id-WORKSPACE_RESTARTED_AFTER_MOVE: |
      | watch-fs stabilized after restart  | [test-id-WATCH_FS_STABILIZED]            |
      | SSE ready after restart            | [test-id-SSE_READY]                      |
      | view loaded                        | [test-id-VIEW_LOADED]                    |
    # Verify the workspace was moved to the new location
    Then file "wiki/tiddlywiki.info" should exist in "wiki-test-moved"
    # Switch back to main window to interact with wiki
    Then I switch to "main" window
    # Verify Index tiddler is displayed (confirms view is loaded)
    Then I should see a "Index tiddler" element in browser view with selector "div[data-tiddler-title='Index']"
    # Verify the wiki is working by modifying a file in the new location
    When I modify file "wiki-test-moved/wiki/tiddlers/Index.tid" to contain "Content after moving workspace"
    Then I wait for tiddler "Index" to be updated by watch-fs
    # The content check will automatically wait for IPC to sync
    And I should see "Content after moving workspace" in the browser view content
