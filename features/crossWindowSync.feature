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

  @crossWindowSync
  Scenario: Bidirectional sync — main→new window and new window→main
    # Part A: Changes in main window should sync to new window
    When I open workspace "wiki" in a new window
    And I switch to the newest window
    And I wait for the page to load completely
    When I switch to "main" window
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler('Index'), {text: 'CrossWindowSyncTestContent123'}))"
    When I switch to the newest window
    Then I should see "CrossWindowSyncTestContent123" in the browser view content

    # Part B: Changes in new window should sync back to main window via SSE
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler($tw.wiki.getTiddler('Index'), {text: 'ReverseWindowSyncTestContent456'}))"
    When I switch to "main" window
    Then I should see "ReverseWindowSyncTestContent456" in the browser view content
