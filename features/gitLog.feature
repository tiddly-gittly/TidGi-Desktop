Feature: Git Log Window
  As a user
  I want to view git commit history in a dedicated window
  So that I can track changes to my wiki

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"

  @git
  Scenario: View git commit in Git Log window
    # Create a new tiddler file to trigger a git commit
    When I create file "{tmpDir}/wiki/tiddlers/GitLogTestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: GitLogTestTiddler
      tags: TestTag
      
      This is a test tiddler for git log feature.
      """
    Then I wait for tiddler "GitLogTestTiddler" to be added by watch-fs
    # Use menu to commit the file - this will use default message (no AI configured)
    When I click menu "知识库 > 立即本地Git备份"
    # wait for git operation to complete
    Then I wait for "git commit completed" log marker "[test-id-git-commit-complete]"
    # Open Git Log through menu
    When I click menu "知识库 > 查看历史备份"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Wait for git log to query history and render UI
    Then I wait for "git log UI refreshed" log marker "[test-id-git-log-refreshed]"
    # Verify the git log window shows commits
    Then I should see a "git log table" element with selector "table"
    # Verify commit with default message - message is in p.MuiTypography-body2
    Then I should see a "commit with default message" element with selector "p.MuiTypography-body2:has-text('使用太记桌面版备份')"
    # Click on the commit row containing GitLogTestTiddler file
    When I click on a "commit row with GitLogTestTiddler" element with selector "tr:has-text('GitLogTestTiddler')"
    And I wait for 1 seconds for "commit details panel to load and file list to populate"
    # Verify the filename appears in the details panel (may include path like tiddlers/GitLogTestTiddler.tid)
    Then I should see a "GitLogTestTiddler.tid file in details" element with selector "li:has-text('GitLogTestTiddler')"

  @git
  Scenario: Git Log window shows uncommitted changes and commit now button works
    # Modify the existing Index.tid file to create uncommitted changes
    And I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Modified Index content - testing realtime update!"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 3 seconds for "git to detect file changes"
    # Open Git Log window
    When I click menu "知识库 > 查看历史备份"
    And I wait for 1 seconds for "git log window to open"
    And I should see "Modified Index content" in the browser view content
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Wait for git log data to stabilize - increased from implicit to explicit
    And I wait for 2 seconds for "git log data to load"
    Then I should see a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    # Click on the uncommitted changes row
    When I click on a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    # Verify we can see the modified Index.tid file
    Then I should see a "Index.tid file in uncommitted list" element with selector "li:has-text('Index.tid')"
    # Switch to Actions tab
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作'), button[role='tab']:has-text('Actions')"
    # Verify the commit now button is visible
    Then I should see a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # Click the commit now button
    When I click on a "commit now button" element with selector "button[data-testid='commit-now-button']"
    Then I wait for "git commit completed" log marker "[test-id-git-commit-complete]"
    # Wait for git log data to be updated and rendered to DOM
    Then I wait for "git log data rendered to DOM" log marker "[test-id-git-log-data-rendered]"
    # After commit, verify the new commit with default message in p tag
    And I should see a "commit with default message" element with selector "p.MuiTypography-body2:has-text('使用太记桌面版备份')"
    # Don't need to Click on the commit row we just created (contains the commit message) Because we should automatically select it
    And I wait for 1 seconds for "commit details panel to load and git lock to release"
    # Don't need to Switch to Actions tab to test rollback, because we are already on Actions tab
    # Click revert button
    When I click on a "revert button" element with selector "button:has-text('回退此提交'), button:has-text('Revert')"
    # Wait for git revert operation to complete - git operations can be slow on CI and may take longer than usual when system is under load
    # The git revert process involves file system operations that may be queued by the OS
    Then I wait for "git revert completed" log marker "[test-id-git-revert-complete]"
    # Switch back to main window to verify the revert
    When I switch to "main" window
    # Wait for file system events to stabilize after git revert - the delete-then-recreate events need time to propagate through nsfw watcher
    # The watch-fs plugin uses a 100ms delay to handle git operations that delete-then-recreate files
    And I wait for 2 seconds for "file system events to stabilize after git revert"
    # The modified content should be reverted, and make sure file won't be deleted
    Then I should not see a "missing tiddler indicator" element in browser view with selector "[data-tiddler-title='Index']:has-text('佚失')"
    Then I should not see a "modified content in Index tiddler" element in browser view with selector "[data-tiddler-title='Index']:has-text('Modified Index content')"

  @git
  Scenario: Discard uncommitted changes for a single file
    # Modify the existing Index.tid file to create uncommitted changes
    And I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Discard test content - should be reverted!"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 1 seconds for "git to detect file changes"
    # Open Git Log window
    When I click menu "知识库 > 查看历史备份"
    And I wait for 1 seconds for "git log window to open"
    And I should see "Discard test content" in the browser view content
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Wait for git log data to load
    And I wait for 2 seconds for "git log data to load"
    Then I should see a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    # Click on the uncommitted changes row
    When I click on a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    And I wait for 0.5 seconds for "file list to populate"
    # Verify we can see the modified Index.tid file
    Then I should see a "Index.tid file in uncommitted list" element with selector "li:has-text('Index.tid')"
    # Click on the Index.tid file to select it
    When I click on a "Index.tid file in list" element with selector "li:has-text('Index.tid')"
    And I wait for 1 seconds for "file diff to load in right panel"
    # Verify the file diff panel has loaded by checking for the file name header
    Then I should see a "file name header in diff panel" element with selector "h6:has-text('Index.tid')"
    # Click the Actions tab in the file diff panel (the one that has the file name above it)
    # We need to find the Actions tab that is a sibling of the h6 containing "Index.tid"
    When I click on a "actions tab in file diff panel" element with selector "h6:has-text('Index.tid') ~ div button[role='tab']:has-text('操作'), h6:has-text('Index.tid') ~ div button[role='tab']:has-text('Actions')"
    And I wait for 1 seconds for "actions tab content to render"
    # Verify the discard changes button exists (only shows for uncommitted changes)
    Then I should see a "discard changes button" element with selector "button:has-text('放弃修改'), button:has-text('Discard changes')"
    When I click on a "discard changes button" element with selector "button:has-text('放弃修改'), button:has-text('Discard changes')"
    # Wait for git discard operation to complete
    And I wait for 2 seconds for "git discard to complete and UI to refresh"
    # Verify the file is no longer in the uncommitted list (should go back to showing no selection)
    Then I should not see a "Index.tid file still selected" element with selector "li:has-text('Index.tid')[class*='selected']"
    # Switch back to main window to verify the discard
    When I switch to "main" window
    # Wait for file system events to stabilize after git discard
    And I wait for 2 seconds for "file system events to stabilize after git discard"
    # The modified content should be discarded
    Then I should not see a "modified content in Index tiddler" element in browser view with selector "[data-tiddler-title='Index']:has-text('Discard test content')"

  @git
  Scenario: Git Log window auto-refreshes when files change (only when window is open)
    # First, close any existing git log window
    When I switch to "main" window
    # Modify Index.tid when git log window is CLOSED
    And I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Modified when window closed"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 2 seconds for "potential git notification to be skipped"
    # Now open Git Log window
    When I click menu "知识库 > 查看历史备份"
    And I wait for 1 seconds for "git log window to open"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Wait for git log to load initial data
    And I wait for 2 seconds for "git log initial data to load"
    # Should see uncommitted changes from the modification
    Then I should see a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    # Now modify another file when git log window is OPEN
    When I switch to "main" window
    And I create file "{tmpDir}/wiki/tiddlers/AutoRefreshTest.tid" with content:
      """
      created: 20250227070000000
      modified: 20250227070000000
      title: AutoRefreshTest
      tags: TestTag
      
      This file is created to test auto-refresh when git log window is open.
      """
    Then I wait for tiddler "AutoRefreshTest" to be added by watch-fs
    # Give git time to detect the new file
    And I wait for 2 seconds for "git to detect new file"
    # Switch back to git log window
    When I switch to "gitHistory" window
    # Wait for auto-refresh to be triggered (500ms debounce + 300ms git refresh debounce + some processing time)
    And I wait for 2 seconds for "git log to auto-refresh after file change"
    # The uncommitted changes row should still be visible and should include the new file
    Then I should see a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    # Click on uncommitted changes to verify both files are there
    When I click on a "uncommitted changes row" element with selector "tr:has-text('未提交')"
    And I wait for 1 seconds for "file list to load"
    # Both Index.tid and AutoRefreshTest.tid should be in the uncommitted list
    Then I should see a "Index.tid in uncommitted list" element with selector "li:has-text('Index.tid')"
    And I should see a "AutoRefreshTest.tid in uncommitted list" element with selector "li:has-text('AutoRefreshTest.tid')"