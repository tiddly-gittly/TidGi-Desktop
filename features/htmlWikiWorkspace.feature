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

  @html-wiki @save
  Scenario: HTML workspace save persists tiddlers across reload
    When I generate blank HTML wiki at "{tmpDir}/blank-wiki.html"
    And I open HTML wiki file "wiki-test/blank-wiki.html" as workspace
    Then the browser view should be loaded and visible
    When I click on "add tiddler button and title input" elements in browser view with selectors:
      | element description | selector                                               |
      | add tiddler button  | button:has(.tc-image-new-button)                       |
      | title input         | .tc-tiddler-edit-frame input.tc-titlebar.tc-edit-texteditor |
    And I press "Control+a" in browser view
    And I press "Delete" in browser view
    And I type "HtmlWikiSaveTestTiddler" in "title input" element in browser view with selector ".tc-tiddler-edit-frame input.tc-titlebar.tc-edit-texteditor"
    And I type "HtmlWikiSaveTestContent" in "body editor" element in browser view with selector ".tc-tiddler-edit-frame textarea.tc-edit-texteditor"
    And I click on "confirm button and save wiki button" elements in browser view with selectors:
      | element description | selector                          |
      | confirm button      | button:has(.tc-image-done-button) |
      | save wiki button    | button:has(.tc-image-save-button-dynamic) |
    Then I wait for "html wiki saved" log marker "[test-id-HTML_WIKI_SAVED]"
    Then file "{tmpDir}/blank-wiki.html" should contain text "HtmlWikiSaveTestTiddler"
    When I restart workspace "blank-wiki"
    Then I wait for "html wiki started" log marker "[test-id-HTML_WIKI_STARTED]"
    When I open tiddler "HtmlWikiSaveTestTiddler" in browser view
    Then I should see a "saved tiddler" element in browser view with selector "div[data-tiddler-title='HtmlWikiSaveTestTiddler']"

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
    And I open HTML wiki file "wiki-test/wiki.html" as workspace
    When I modify file "{tmpDir}/wiki.html" to contain "<html><body>updated html</body></html>"
    And I modify file "{tmpDir}/notes.txt" to contain "changed notes should not appear in git log"
    When I click menu "同步和备份 > 查看历史备份"
    And I switch to "gitHistory" window
    And I wait for the page to load completely
    Then I wait for "git log UI refreshed" log marker "[test-id-git-log-refreshed]"
    Then I should see a "wiki.html in uncommitted list" element with selector "li:has-text('wiki.html')"
    Then I should not see a "notes.txt in uncommitted list" element with selector "li:has-text('notes.txt')"

  @html-wiki @http-sync
  Scenario: HTML workspace exposes mobile whole-file sync and persists settings changes
    When I generate blank HTML wiki at "{tmpDir}/mobile-sync-wiki.html"
    And I open HTML wiki file "wiki-test/mobile-sync-wiki.html" as workspace
    When I update workspace "mobile-sync-wiki" settings:
      | property      | value |
      | enableHTTPAPI | true  |
    Then I wait for "html wiki http started" log marker "[test-id-HTML_WIKI_HTTP_STARTED]"
    Then workspace "mobile-sync-wiki" should expose HTML sync info
    When I PUT HTML sync file for workspace "mobile-sync-wiki" with content "<html><body>MobileSyncUpdated</body></html>"
    Then file "{tmpDir}/mobile-sync-wiki.html" should contain text "MobileSyncUpdated"
    When I open edit workspace window for workspace with name "mobile-sync-wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I type "Renamed HTML Workspace" in "workspace name" element with selector "input[value='mobile-sync-wiki']"
    And I click on a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    Then settings.json should have workspace "Renamed HTML Workspace" with "name" set to "Renamed HTML Workspace"
