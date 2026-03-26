Feature: AI-Generated Git Commit Messages
  As a user
  I want AI to automatically generate commit messages
  So that I can have meaningful backup titles based on my changes

  @git @mockOpenAI
  Scenario: AI button in Git Log window uses AI-generated commit message
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
    # Open Git Log window to commit using the AI button
    When I click menu "同步和备份 > 查看历史备份"
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
    # Both buttons must be visible: plain backup and AI backup
    Then I should see "commit now button and commit now AI button" elements with selectors:
      | element description    | selector                                |
      | commit now button      | button[data-testid='commit-now-button'] |
      | commit now AI button   | button[data-testid='commit-now-ai-button'] |
    # Click the AI commit button - this should call AI and produce the mocked message
    When I click on a "commit now AI button" element with selector "button[data-testid='commit-now-ai-button']"
    Then I wait for log markers:
      | description                  | marker                          |
      | git commit completed         | [test-id-git-commit-complete]   |
      | git log data rendered to DOM | [test-id-git-log-data-rendered] |
    # After commit, verify AI-generated message appears in git log table
    Then I should see "commit with AI message and Index.tid file" elements with selectors:
      | element description    | selector                                          |
      | commit with AI message | p.MuiTypography-body2:has-text('更新 Index 条目') |
      | Index.tid file         | div.MuiBox-root[aria-label*='Index.tid']          |

  @git @mockOpenAI
  Scenario: Plain backup button in Git Log window uses default message, not AI — even when AI is enabled and mock is slow
    # This scenario guards against regression where the plain backup button accidentally
    # called the sync path which omitted commitMessage and therefore triggered AI generation.
    # The mock server uses stream:true (5-second delay per chunk) to expose that bug:
    # if the plain button were to go through AI, it would either hang >5 s or produce the
    # mocked AI message instead of the default "使用太记桌面版备份".
    Given I cleanup test wiki so it could create a new one on start
    Given I add test ai settings:
      | freeModel             | true |
      | aiGenerateBackupTitle | true |
    # Slow streaming mock — each chunk takes 5 s. Plain backup button must complete before this finishes.
    And I have started the mock OpenAI server
      | response                          | stream |
      | AI消息不应该出现在普通备份按钮里   | true   |
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Plain backup button test content"
    Then I wait for tiddler "Index" to be updated by watch-fs
    When I click menu "同步和备份 > 查看历史备份"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    Then I should see a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    When I click on a "uncommitted changes row" element with selector "[data-testid='uncommitted-changes-row']"
    Then I should see a "Index.tid file in uncommitted list" element with selector "li:has-text('Index.tid')"
    When I click on a "actions tab" element with selector "button[role='tab']:has-text('操作'), button[role='tab']:has-text('Actions')"
    Then I should see a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # Click the PLAIN (non-AI) button — must complete quickly with the default message
    When I click on a "commit now button" element with selector "button[data-testid='commit-now-button']"
    # The plain button must produce [test-id-git-commit-complete] WITHOUT waiting for the slow AI mock.
    # If it mistakenly called AI, this would take ≥5 s per chunk and likely time out.
    Then I wait for log markers:
      | description                  | marker                          |
      | git commit completed         | [test-id-git-commit-complete]   |
      | git log data rendered to DOM | [test-id-git-log-data-rendered] |
    # The commit message MUST be the default, not the AI mock response
    Then I should see "commit with default message and Index.tid file" elements with selectors:
      | element description        | selector                                                        |
      | commit with default message| p.MuiTypography-body2:has-text('使用太记桌面版备份')             |
      | Index.tid file             | div.MuiBox-root[aria-label*='Index.tid']                        |
    # AI message must NOT appear — if it does, the plain button incorrectly used AI
    Then I should not see a "AI message in commit list" element with selector "p.MuiTypography-body2:has-text('AI消息不应该出现在普通备份按钮里')"

