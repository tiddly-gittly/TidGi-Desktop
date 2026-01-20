Feature: AI-Generated Git Commit Messages
  As a user
  I want AI to automatically generate commit messages
  So that I can have meaningful backup titles based on my changes

  @git @mockOpenAI
  Scenario: AI generates commit message based on file changes
    Given I cleanup test wiki so it could create a new one on start
    Given I add test ai settings:
      | freeModel             | true |
      | aiGenerateBackupTitle | true |
    # Start mock server BEFORE launching the application
    And I have started the mock OpenAI server
      | response                                | stream |
      | 更新 Index 条目：添加关于 AI 测试的内容 | false  |
    # Now launch the application
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
    # Modify a file to create changes
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "AI-generated commit message test content"
    Then I wait for tiddler "Index" to be updated by watch-fs
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
    Then I wait for log markers:
      | description                  | marker                          |
      | git commit completed         | [test-id-git-commit-complete]   |
      | git log data rendered to DOM | [test-id-git-log-data-rendered] |
    # After commit, verify AI-generated message and file in git log table
    # Message is in p.MuiTypography-body2, file div has aria-label
    Then I should see "commit with AI message and Index.tid file" elements with selectors:
      | element description    | selector                                          |
      | commit with AI message | p.MuiTypography-body2:has-text('更新 Index 条目') |
      | Index.tid file         | div.MuiBox-root[aria-label*='Index.tid']          |
