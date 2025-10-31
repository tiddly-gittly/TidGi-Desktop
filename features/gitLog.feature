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
    # Use menu to commit the file
    When I click menu "知识库 > 立即备份"
    # wait for git operation to complete
    And I wait for 1 seconds for "git commit to complete"
    # Open Git Log through menu
    When I click menu "知识库 > 查看历史备份"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Verify the git log window shows commits
    Then I should see a "git log table" element with selector "table"
    # Verify we can see our committed file in a row
    Then I should see a "commit row with GitLogTestTiddler" element with selector "tr:has-text('GitLogTestTiddler')"
    # Click on the commit row to view details
    When I click on a "commit row with GitLogTestTiddler" element with selector "tr:has-text('GitLogTestTiddler')"
    # Verify the file appears in the details panel
    Then I should see a "GitLogTestTiddler.tid file in details" element with selector "li:has-text('GitLogTestTiddler.tid')"

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
    # Wait for observable to trigger refresh - git log window needs to reload commit list after commit
    And I wait for 1 seconds for "git log UI to receive update notification"
    # Wait for the system to stabilize and UI to re-render with new commit
    And I wait for 3 seconds for "observable to refresh and system to stabilize"
    # After commit, verify we can see the new commit with Index.tid in the file list
    And I should see a "commit with Index.tid" element with selector "tr:has-text('Index.tid')"
    # Click on the commit row that contains Index.tid to view its details
    When I click on a "commit with Index.tid" element with selector "tr:has-text('Index.tid')"
    And I wait for 0.5 seconds for "commit details panel to load"
    # Switch to Actions tab to test rollback
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作'), button[role='tab']:has-text('Actions')"
    Then I should see a "revert button" element with selector "button:has-text('回退此提交'), button:has-text('Revert')"
    # Click revert button
    When I click on a "revert button" element with selector "button:has-text('回退此提交'), button:has-text('Revert')"
    # Wait for git revert operation to complete - git operations can be slow on CI and may take longer than usual when system is under load
    # The git revert process involves file system operations that may be queued by the OS
    And I wait for 3 seconds for "git revert to execute"
    Then I wait for "git revert completed" log marker "[test-id-git-revert-complete]"
    # Switch back to main window to verify the revert
    When I switch to "main" window
    # Wait for file system events to stabilize after git revert - the delete-then-recreate events need time to propagate through nsfw watcher
    # The watch-fs plugin uses a 100ms delay to handle git operations that delete-then-recreate files
    And I wait for 2 seconds for "file system events to stabilize after git revert"
    # The modified content should be reverted, and make sure file won't be deleted
    Then I should not see a "missing tiddler indicator" element in browser view with selector "[data-tiddler-title='Index']:has-text('佚失')"
    Then I should not see a "modified content in Index tiddler" element in browser view with selector "[data-tiddler-title='Index']:has-text('Modified Index content')"