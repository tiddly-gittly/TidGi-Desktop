@tidgiminiwindow
Feature: TidGi Mini Window Workspace Switching
  As a user with tidgi mini window already enabled
  I want to test tidgi mini window behavior with different workspace configurations
  So that I can verify workspace switching and fixed workspace features

  Background:
    Given I configure tidgi mini window with shortcut
    Then I launch the TidGi application
    And I wait for the page to load completely
    Then I switch to "main" window

  Scenario: TidGi mini window syncs with main window switching to agent workspace
    # Switch main window to agent workspace
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    # Verify tidgi mini window exists in background (created but not visible)
    And I wait for 0.2 seconds
    Then I confirm the "tidgiminiwindow" window exists
    And I confirm the "tidgiminiwindow" window not visible
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiminiwindow" window visible
    And I confirm the "tidgiminiwindow" window browser view is not positioned within visible window bounds
    Then I switch to "tidgiminiwindow" window
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  Scenario: TidGi mini window with fixed agent workspace shows no view and fixed wiki workspace shows browser view
    # Configure fixed agent workspace through UI
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on a "tidgi mini window section" element with selector "[data-testid='preference-section-tidgiMiniWindow']"
    When I click on a "Disable tidgi mini window sync workspace switch" element with selector "[data-testid='tidgi-mini-window-sync-workspace-switch']"
    # Select agent workspace (which is a page type workspace)
    And I select "agent" from MUI Select with test id "tidgi-mini-window-fixed-workspace-select"
    And I wait for 0.2 seconds
    # Open tidgi mini window - should show agent workspace and no browser view
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiminiwindow" window visible
    And I confirm the "tidgiminiwindow" window browser view is not positioned within visible window bounds
    Then I switch to "tidgiminiwindow" window
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    # Close tidgi mini window and switch to wiki workspace
    And I wait for 0.2 seconds
    Then I switch to "preferences" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiminiwindow" window not visible
    # Get the first wiki workspace ID and select it
    And I select "wiki" from MUI Select with test id "tidgi-mini-window-fixed-workspace-select"
    And I wait for 0.2 seconds
    # Open tidgi mini window again - should show wiki workspace with browser view
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiminiwindow" window visible
    And I confirm the "tidgiminiwindow" window browser view is positioned within visible window bounds
    Then I switch to "tidgiminiwindow" window
    And the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
