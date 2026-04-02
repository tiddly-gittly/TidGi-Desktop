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
  Scenario: Changes made to files should sync back to browser via SSE
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    And I wait for SSE and watch-fs to be ready
    # Edit Index tiddler in window A via TW syncer (this triggers save to server → disk)
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler({title: 'Index', text: 'CrossWindowSyncTestContent123'}))"
    # Wait for the syncer to save the tiddler to disk via server, so window B sees it
    Then I wait for tiddler "Index" to be updated by watch-fs
    
    # Open workspace in a new window (window B)
    When I open workspace "wiki" in a new window

    # Switch to the newly opened secondary window and verify it sees the same wiki content
    When I switch to the newest window
    Then the browser view should be loaded and visible
    Then I should see "CrossWindowSyncTestContent123" in the browser view content
