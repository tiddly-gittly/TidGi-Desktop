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
    # Edit Index tiddler in window A
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler({title: 'Index', text: 'CrossWindowSyncTestContent123'}))"
    
    # Open workspace in a new window (window B)
    When I open workspace "wiki" in a new window
    
    # TODO: Switch to window B and verify content
    # This requires additional step definitions to:
    # 1. Get the new window handle
    # 2. Switch context to the new window
    # 3. Verify content in window B
    
    # For now, verify content in window A (proves tiddler was saved)
    Then I should see "CrossWindowSyncTestContent123" in the browser view content
