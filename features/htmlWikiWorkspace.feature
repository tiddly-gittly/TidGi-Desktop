@html-wiki @workspace
Feature: HTML wiki workspace
  As a TidGi user
  I want to open a single HTML wiki file as a workspace
  So that saves write back to the same file and git only tracks that file

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"

  @html-wiki
  Scenario: Add workspace UI shows open HTML wiki file tab
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    Then I should see "html wiki tabs" elements with selectors:
      | element description        | selector                              |
      | open html wiki file tab    | button:has-text('打开 HTML 知识库文件') |
      | unpack html wiki tab       | button:has-text('解包 HTML 为文件夹知识库') |

  @html-wiki @git
  Scenario: HTML workspace git log only shows the managed html file
    When I create file "{tmpDir}/wiki.html" with content:
      """
      <html><head><title>HTML Wiki E2E</title></head><body><p>HTML Wiki E2E Content</p></body></html>
      """
    And I create file "{tmpDir}/notes.txt" with content:
      """
      unrelated notes file
      """
    And I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    When I click on a "open html wiki tab" element with selector "button:has-text('打开 HTML 知识库文件')"
    When I prepare to select file in dialog "wiki-test/wiki.html"
    When I click on a "choose html file button" element with selector "button:has-text('选择')"
    And I click on a "open html wiki done button" element with selector "[data-testid='open-html-wiki-done-button']"
    When I switch to "main" window
    Then I wait for "workspace created" log marker "[test-id-WORKSPACE_CREATED]"
    Then I wait for "html wiki started" log marker "[test-id-HTML_WIKI_STARTED]"
    When I modify file "{tmpDir}/wiki.html" to contain "<html><body>updated html</body></html>"
    And I modify file "{tmpDir}/notes.txt" to contain "changed notes should not appear in git log"
    When I click menu "同步和备份 > 查看历史备份"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    Then I wait for "git log UI refreshed" log marker "[test-id-git-log-refreshed]"
    Then I should see a "wiki.html in uncommitted list" element with selector "li:has-text('wiki.html')"
    Then I should not see a "notes.txt in uncommitted list" element with selector "li:has-text('notes.txt')"
