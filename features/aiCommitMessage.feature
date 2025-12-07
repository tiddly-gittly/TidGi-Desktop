Feature: AI-Generated Git Commit Messages
  As a user
  I want AI to automatically generate commit messages
  So that I can have meaningful backup titles based on my changes

  Background:
    Given I cleanup test wiki so it could create a new one on start
    Given I add test ai settings:
      | freeModel             | true |
      | aiGenerateBackupTitle | true |
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"

  @git @mockOpenAI
  Scenario: AI generates commit message based on file changes
    And I have started the mock OpenAI server
      | response                                | stream |
      | 更新 Index 条目：添加关于 AI 测试的内容 | false  |
    # Modify a file to create changes
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "AI-generated commit message test content"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 3 seconds for "git to detect file changes"
    # Open Git Log window to commit using the button
    When I click menu "知识库 > 查看历史备份"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    # Should see uncommitted changes row
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Click on the uncommitted changes row
    When I click on a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    # Verify we can see the modified Index.tid file
    Then I should see a "Index.tid file in uncommitted list" element with selector "li:has-text('Index.tid')"
    # Switch to Actions tab
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作'), button[role='tab']:has-text('Actions')"
    # Verify the commit now button is visible
    Then I should see a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # Click the commit now button - this will trigger AI generation
    When I click on a "commit now button" element with selector "button[data-testid='commit-now-button']"
    Then I wait for "git commit completed" log marker "[test-id-git-commit-complete]"
    # Wait for git log data to be updated and rendered to DOM
    Then I wait for "git log data rendered to DOM" log marker "[test-id-git-log-data-rendered]"
    # After commit, verify AI-generated message and file in git log table
    # Message is in p.MuiTypography-body2, file div has aria-label
    Then I should see "commit with AI message and Index.tid file" elements with selectors:
      | p.MuiTypography-body2:has-text('更新 Index 条目') |
      | div.MuiBox-root[aria-label*='Index.tid']         |
