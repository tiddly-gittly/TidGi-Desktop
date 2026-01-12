Feature: TidGi Default Wiki
  As a user
  I want app auto create a default wiki workspace for me
  So that I can start using wiki immediately

  Background:
    # Note: tests expect the test wiki parent folder to exist. Run the preparation step before E2E:
    #   cross-env NODE_ENV=test pnpm dlx tsx scripts/developmentMkdir.ts
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely

  @wiki
  Scenario: Application has default wiki workspace
    Then I should see "page body and wiki workspace" elements with selectors:
      | body                                            |
      | div[data-testid^='workspace-']:has-text('wiki') |
    And the window title should contain "太记"

  @wiki
  Scenario: Default wiki workspace displays TiddlyWiki content in browser view
    And the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content

  @wiki @create-main-workspace
  Scenario: Create new main workspace via UI from top sidebar
    # Prerequisite: app starts with default wiki workspace
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Clear previous log markers before waiting for new ones
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    # Step 1: Click add workspace button in top sidebar
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    # Step 2: Verify we're on "Create New Wiki" tab (should be default)
    Then I should see a "create new wiki tab" element with selector "button:has-text('创建新知识库')"
    # Step 3: Since there's already a default "wiki" workspace, the advanced accordion should be expanded
    # Verify we're in main workspace mode (not sub-workspace)
    Then I should see a "main/sub workspace switch" element with selector "[data-testid='main-sub-workspace-switch']"
    # Step 4: Enter a different wiki folder name (default "wiki" already exists)
    # First clear any existing value in the input field
    When I clear text in "wiki folder name input" element with selector "label:has-text('即将新建的知识库文件夹名') + div input"
    # Then type the new folder name
    When I type "wiki2" in "wiki folder name input" element with selector "label:has-text('即将新建的知识库文件夹名') + div input"
    # Step 5: Click the create button to create the workspace
    When I click on a "create wiki button" element with selector "button:has-text('创建知识库')"
    # Wait for workspace to be created using log marker
    Then I wait for "workspace created" log marker "[test-id-WORKSPACE_CREATED]"
    # Switch back to main window
    When I switch to "main" window
    # Wait for wiki view to fully load
    Then I wait for "view loaded" log marker "[test-id-VIEW_LOADED]"
    # Step 7: Verify the new workspace appears in the sidebar
    Then I should see a "wiki2 workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki2')"
    # Step 8: Verify workspace is functional - click it and check browser view loads
    When I click on a "wiki2 workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki2')"
    And the browser view should be loaded and visible
    # Verify TiddlyWiki content is displayed in the new workspace
    Then I should see "我的 TiddlyWiki" in the browser view content

  @wiki @move-workspace
  Scenario: Move workspace to a new location
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on a "save and sync options accordion" element with selector "[data-testid='preference-section-saveAndSyncOptions']"
    Then I should see a "move workspace button" element with selector "button:has-text('移动工作区')"
    # Test the actual move operation - this will trigger a file dialog
    When I prepare to select directory in dialog "wiki-test-moved"
    And I click on a "move workspace button" element with selector "button:has-text('移动工作区')"
    Then I wait for "workspace moved to wiki-test-moved" log marker "[test-id-WORKSPACE_MOVED:"
    Then I wait for "workspace restarted after move" log marker "[test-id-WORKSPACE_RESTARTED_AFTER_MOVE:"
    # Wait for SSE and watch-fs to stabilize after restart
    And I wait for "watch-fs stabilized after restart" log marker "[test-id-WATCH_FS_STABILIZED]"
    And I wait for "SSE ready after restart" log marker "[test-id-SSE_READY]"
    Then I wait for "view loaded" log marker "[test-id-VIEW_LOADED]"
    # Verify the workspace was moved to the new location
    Then file "wiki/tiddlywiki.info" should exist in "wiki-test-moved"
    # Switch back to main window to interact with wiki
    Then I switch to "main" window
    # Wait a bit to ensure view is fully ready to receive updates
    And I wait for 1 seconds for "view to be ready"
    # Verify Index tiddler is displayed (confirms view is loaded)
    Then I should see a "Index tiddler" element in browser view with selector "div[data-tiddler-title='Index']"
    # Verify the wiki is working by modifying a file in the new location
    When I modify file "wiki-test-moved/wiki/tiddlers/Index.tid" to contain "Content after moving workspace"
    Then I wait for tiddler "Index" to be updated by watch-fs
    # wait for IPC to sync to frontend
    And I wait for 2 seconds for "IPC to sync"
    And I should see "Content after moving workspace" in the browser view content
    # Move it back to original location for cleanup
    # Clear test-id markers to ensure we're waiting for fresh logs from second restart
    When I clear test-id markers from logs
    And I switch to "editWorkspace" window
    When I prepare to select directory in dialog "wiki-test"
    And I click on a "move workspace button" element with selector "button:has-text('移动工作区')"
    Then I wait for "workspace moved back to wiki-test" log marker "[test-id-WORKSPACE_MOVED:"
    Then I wait for "workspace restarted after move back" log marker "[test-id-WORKSPACE_RESTARTED_AFTER_MOVE:"
    # Wait for SSE and watch-fs to stabilize after restart back
    And I wait for "watch-fs stabilized after restart back" log marker "[test-id-WATCH_FS_STABILIZED]"
    And I wait for "SSE ready after restart back" log marker "[test-id-SSE_READY]"
    Then I wait for "view loaded after restart back" log marker "[test-id-VIEW_LOADED]"
    Then file "wiki/tiddlywiki.info" should exist in "wiki-test"
    # Switch to main window and wait for view to be ready
    Then I switch to "main" window
    And I wait for 2 seconds for "view to be ready after move back"
    # Verify the wiki still works after moving back
    When I modify file "wiki-test/wiki/tiddlers/Index.tid" to contain "Content after moving back"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 3 seconds for "IPC to sync after second restart"
    And I should see "Content after moving back" in the browser view content
