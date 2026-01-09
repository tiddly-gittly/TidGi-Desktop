Feature: Git Log Window
  As a user
  I want to view git commit history in a dedicated window
  So that I can track changes to my wiki

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
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
    Then I should see a "git log list" element with selector "[data-testid='git-log-list']"
    # Verify commit with default message - message is in p.MuiTypography-body2
    Then I should see a "commit with default message" element with selector "p.MuiTypography-body2:has-text('使用太记桌面版备份')"
    # Click on the commit row containing GitLogTestTiddler file
    When I click on a "commit row with GitLogTestTiddler" element with selector "[data-testid^='commit-row-']:has-text('GitLogTestTiddler')"
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
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Verify uncommitted changes is auto-selected by checking if the file list is visible
    Then I should see a "Index.tid file in uncommitted list" element with selector "li:has-text('Index.tid')"
    # Switch to Actions tab to access commit button
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作')"
    # Verify the commit now button is visible
    Then I should see a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # Click the commit now button
    When I click on a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # Wait for git commit to complete first
    Then I wait for "git commit completed" log marker "[test-id-git-commit-complete]"
    # Clear old git-log-data-rendered markers to wait for the new one after commit
    When I clear log lines containing "[test-id-git-log-data-rendered]"
    # Then wait for UI to render the updated data (without uncommitted changes)
    Then I wait for "git log data rendered after commit" log marker "[test-id-git-log-data-rendered]"
    # Verify that uncommitted changes row is gone (commit was successful)
    Then I should not see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Verify the correct commit is selected and we're on the latest commit (should show amend button)
    Then I should see "selected commit row and commit message and amend button and revert button" elements with selectors:
      | [data-testid^='commit-row-'][data-selected='true']:has-text('使用太记桌面版备份') |
      | p.MuiTypography-body2:has-text('使用太记桌面版备份')                              |
      | button:has-text('修改')                                                           |
      | button:has-text('回滚')                                                           |
    # Click revert button
    When I click on a "revert button" element with selector "button:has-text('回滚')"
    # Wait for git revert operation to complete and UI to render the new revert commit
    Then I wait for "git revert completed" log marker "[test-id-git-revert-complete]"
    When I clear log lines containing "[test-id-git-log-data-rendered]"
    # Give UI time to start refreshing after revert before waiting for the rendered marker
    And I wait for 1 seconds for "UI to start refreshing after revert"
    Then I wait for "git log data rendered after revert" log marker "[test-id-git-log-data-rendered]"
    # Verify that the new revert commit is auto-selected (should contain "回退提交" in the message)
    Then I should see a "selected revert commit row" element with selector "[data-testid^='commit-row-'][data-selected='true']:has-text('回退提交')"
    # Also verify the revert button is visible (confirms we're on the new commit)
    Then I should see a "revert button for the new revert commit" element with selector "button:has-text('回滚')"
    # Switch back to main window to verify the revert
    When I switch to "main" window
    # Wait for tiddler to be updated by watch-fs after git revert
    Then I wait for tiddler "Index" to be updated by watch-fs
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
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Click on the uncommitted changes row
    When I click on a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
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
    When I click on a "actions tab in file diff panel" element with selector "h6:has-text('Index.tid') ~ div button[role='tab']:has-text('操作')"
    And I wait for 1 seconds for "actions tab content to render"
    # Verify the discard changes button exists (only shows for uncommitted changes)
    Then I should see a "discard changes button" element with selector "button:has-text('放弃修改')"
    When I click on a "discard changes button" element with selector "button:has-text('放弃修改')"
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
    # Open Git Log window FIRST
    When I click menu "知识库 > 查看历史备份"
    And I wait for 1 seconds for "git log window to open"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Should see initial commits
    Then I should see a "commit history list" element with selector "[data-testid='git-log-list']"
    # Now modify a file WHILE window is open - this should trigger auto-refresh
    When I switch to "main" window
    And I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Modified with window open"
    Then I wait for tiddler "Index" to be updated by watch-fs
    # Wait for git log to auto-refresh after detecting file changes
    And I wait for "git log auto-refreshed after file change" log marker "[test-id-git-log-refreshed]"
    # Switch back to git log window
    When I switch to "gitHistory" window
    # Should see uncommitted changes row appear or update
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Click on uncommitted changes to verify the modified file is there
    When I click on a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    And I wait for 1 seconds for "file list to load"
    # Should see Index.tid in the uncommitted list
    Then I should see a "Index.tid in uncommitted list" element with selector "li:has-text('Index.tid')"
    # Now create a NEW file while window is still open
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
    # Wait for git log to auto-refresh after detecting new file
    And I wait for "git log auto-refreshed after new file" log marker "[test-id-git-log-refreshed]"
    # Switch back to git log window
    When I switch to "gitHistory" window
    # The uncommitted changes row should still be visible
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Click on uncommitted changes again to see both files
    When I click on a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    And I wait for 1 seconds for "file list to reload"
    # Both Index.tid and AutoRefreshTest.tid should be in the uncommitted list
    Then I should see a "Index.tid in uncommitted list" element with selector "li:has-text('Index.tid')"
    And I should see a "AutoRefreshTest.tid in uncommitted list" element with selector "li:has-text('AutoRefreshTest.tid')"