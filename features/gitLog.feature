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

  @git-log
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
    And I wait for 1 seconds
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

  @git-log-realtime
  Scenario: Git Log window shows uncommitted changes and commit now button works
    # Open Git Log window first
    When I click menu "知识库 > 查看历史备份"
    And I wait for 2 seconds
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Verify initial state - should see the git log table
    Then I should see a "git log table" element with selector "table"
    # Now modify the existing Index.tid file to create uncommitted changes
    When I switch to "main" window
    And I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Modified Index content - testing realtime update!"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 4 seconds
    # Switch back to git log window - should now see uncommitted changes row (wait for auto-refresh)
    When I switch to "gitHistory" window
    And I wait for 1 seconds
    Then I should see a "uncommitted changes row" element with selector "tr:has-text('未提交'), tr:has-text('Uncommitted')"
    # Click on the uncommitted changes row
    When I click on a "uncommitted changes row" element with selector "tr:has-text('未提交'), tr:has-text('Uncommitted')"
    And I wait for 1 seconds
    # Verify we can see the modified Index.tid file
    Then I should see a "Index.tid file in uncommitted list" element with selector "li:has-text('Index.tid')"
    # Switch to Actions tab
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作'), button[role='tab']:has-text('Actions')"
    And I wait for 0.5 seconds
    # Verify the commit now button is visible
    Then I should see a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # Click the commit now button
    When I click on a "commit now button" element with selector "button[data-testid='commit-now-button']"
    Then I wait for git operation "test-id-git-commit-complete" with description "git commit completed" to complete
    # After commit, the uncommitted row should disappear and a new commit should appear
    Then I should not see a "uncommitted changes row" element with selector "tr:has-text('未提交'), tr:has-text('Uncommitted')"
    # Wait for observable to trigger refresh
    And I wait for 3 seconds
    And I should see a "new commit row" element with selector "tr:has-text('Manual backup'), tr:has-text('使用太记桌面版备份')"
    # Click on the new commit row to view its details
    When I click on a "new commit row" element with selector "tr:has-text('Manual backup'), tr:has-text('使用太记桌面版备份')"
    And I wait for 1 seconds
    # Switch to Actions tab to test rollback
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作'), button[role='tab']:has-text('Actions')"
    And I wait for 0.5 seconds
    Then I should see a "revert button" element with selector "button:has-text('回退此提交'), button:has-text('Revert')"
    # Click revert button
    When I click on a "revert button" element with selector "button:has-text('回退此提交'), button:has-text('Revert')"
    Then I wait for git operation "test-id-git-revert-complete" with description "git revert completed" to complete
    # Switch back to main window to verify the revert
    When I switch to "main" window
    And I wait for 2 seconds
    # The modified content should be reverted
    Then I should not see "Modified Index content" in the browser view content