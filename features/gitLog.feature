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
