Feature: Workspace Configuration Sync
  As a user
  I want workspace settings saved to tidgi.config.json
  So that settings persist when I remove and re-add a workspace

  Background:
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely

  @workspace-config
  Scenario: Workspace config is saved and restored via tidgi.config.json
    # Wait for default wiki to fully initialize (browser view loaded)
    And the browser view should be loaded and visible
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Step 1: Update workspace name via API (this triggers config file write)
    When I update workspace "wiki" settings:
      | property | value       |
      | name     | WikiRenamed |
    # Wait for config to be written to tidgi.config.json
    Then I wait for "config file written" log marker "[test-id-TIDGI_CONFIG_WRITTEN]"
    # Step 2: Verify tidgi.config.json was updated
    Then file "wiki/tidgi.config.json" should exist in "wiki-test"
    Then file "wiki/tidgi.config.json" should contain JSON with:
      | jsonPath | value       |
      | $.name   | WikiRenamed |
    # Step 3: Remove the workspace (keep files) via API
    When I remove workspace "WikiRenamed" keeping files
    # Step 4: Verify workspace is removed but config file still exists
    Then I should not see "wiki workspace in sidebar" elements with selectors:
      | div[data-testid^='workspace-']:has-text('WikiRenamed') |
    Then file "wiki/tidgi.config.json" should exist in "wiki-test"
    # Step 5: Re-add the workspace by opening existing wiki
    # Clear previous log markers before waiting for new ones
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    When I click on a "open existing wiki tab" element with selector "button:has-text('导入本地知识库')"
    When I prepare to select directory in dialog "wiki-test/wiki"
    When I click on a "select folder button" element with selector "button:has-text('选择')"
    # Click the import button to actually add the workspace
    When I click on a "import wiki button" element with selector "button:has-text('导入知识库')"
    # Wait for workspace to be created using log marker
    Then I wait for "workspace created" log marker "[test-id-WORKSPACE_CREATED]"
    # Switch back to main window first, then wait for view to load
    When I switch to "main" window
    # Wait for wiki view to fully load
    Then I wait for "view loaded" log marker "[test-id-VIEW_LOADED]"
    # Step 6: Verify workspace is back with the saved name from tidgi.config.json
    Then I should see a "restored wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('WikiRenamed')"
    # Verify wiki is actually loaded and functional
    And the browser view should be loaded and visible
