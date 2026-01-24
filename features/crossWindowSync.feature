Feature: Cross-Window Synchronization
  As a user
  I want changes made in the main window to sync to new windows
  So that I can view consistent content across all windows

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for "SSE backend ready" log marker "[test-id-SSE_READY]"

  @crossWindowSync @crossWindowSync-basic
  Scenario: Changes in main window should sync to file system and be loadable in new window
    # Open workspace in a new window to test cross-window sync
    When I open workspace "wiki" in a new window
    And I switch to the newest window
    And I wait for the page to load completely
    # Open Index in the new window
    # Switch back to main window and edit the Index tiddler
    When I switch to "main" window
    # Edit the Index tiddler in the main window (using TiddlyWiki API to trigger IPC save)
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler('Index'), {text: 'CrossWindowSyncTestContent123'}))"
    # Switch to the new window to verify the change was synced
    When I switch to the newest window
    # Verify content is visible in the new window (proving SSE push works)
    Then I should see "CrossWindowSyncTestContent123" in the browser view content

  @crossWindowSync @crossWindowSync-reverse
  Scenario: Changes in new window should sync back to main window via SSE
    # Open workspace in a new window
    When I open workspace "wiki" in a new window
    And I switch to the newest window
    And I wait for the page to load completely
    # Edit the Index tiddler in the NEW window (using TiddlyWiki API to trigger IPC save)
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler('Index'), {text: 'ReverseWindowSyncTestContent456'}))"
    # Switch back to main window to verify the change was synced
    When I switch to "main" window
    # Verify content is visible in the main window (proving SSE push works in reverse direction)
    Then I should see "ReverseWindowSyncTestContent456" in the browser view content
