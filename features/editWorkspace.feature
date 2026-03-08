@edit-workspace-save
Feature: Edit Workspace
  As a user
  I want to edit workspace settings

  Background:
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Open edit workspace window
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window

  @edit-workspace-save-http-api
  Scenario: Save button disappears after enabling HTTP API and restarting wiki
    # Enable HTTP API (this requires restart, so save button will show a restart snackbar)
    When I click on "server options accordion and enableHTTPAPI switch and save button" elements with selectors:
      | element description      | selector                                         |
      | server options accordion | [data-testid='preference-section-serverOptions'] |
      | enableHTTPAPI switch     | [data-testid='enable-http-api-switch']           |
      | save button              | [data-testid='edit-workspace-save-button']       |
    Then I should not see a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should see a "restart snackbar with restart button" element with selector "button:has-text('现在重启知识库')"
    # Clear RESTARTING marker to catch the new restart event
    And I clear log lines containing "[test-id-WIKI_WORKER_RESTARTING]"
    # Click the restart button in the snackbar (still in editWorkspace window)
    When I click on a "restart now button in snackbar" element with selector "button:has-text('现在重启知识库')"
    # Wait for wiki worker restart to begin - RESTARTING marker is logged immediately when restart starts
    Then I wait for "wiki worker restart initiated" log marker "[test-id-WIKI_WORKER_RESTARTING]"
    # Save button should STILL be hidden after restart completes
    # This tests that the workspace state doesn't diverge after restart, not triggered by fields like `lastUrl`
    Then I should not see a "save button after restart" element with selector "[data-testid='edit-workspace-save-button']"
    Then settings.json should have workspace "wiki" with "enableHTTPAPI" set to "true"
