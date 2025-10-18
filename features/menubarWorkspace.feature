@menubar
Feature: TidGi Menubar Window Workspace Switching
  As a user with menubar already enabled
  I want to test menubar window behavior with different workspace configurations
  So that I can verify workspace switching and fixed workspace features

  Background:
    Given I configure menubar with shortcut
    Then I launch the TidGi application
    And I wait for the page to load completely
    Then I switch to "main" window

  Scenario: Menubar window syncs with main window switching to agent workspace
    # Switch main window to agent workspace
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    # Verify menubar window exists in background (created but not visible)
    And I wait for 0.2 seconds
    Then I confirm the "menubar" window exists
    And I confirm the "menubar" window not visible
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window visible
    And I confirm the "menubar" window browser view is not positioned within visible window bounds
    Then I switch to "menubar" window
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    # Clean up menubar settings to avoid affecting other tests
    Then I clear test menubar settings

  Scenario: Menubar window with fixed agent workspace shows no view and fixed wiki workspace shows browser view
    # Configure fixed agent workspace through UI
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on a "menubar section" element with selector "[data-testid='preference-section-menubar']"
    When I click on a "Disable menubar sync workspace switch" element with selector "[data-testid='menubar-sync-workspace-switch']"
    # Select agent workspace (which is a page type workspace)
    And I select "agent" from MUI Select with test id "menubar-fixed-workspace-select"
    And I wait for 0.2 seconds
    # Open menubar window - should show agent workspace and no browser view
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window visible
    And I confirm the "menubar" window browser view is not positioned within visible window bounds
    Then I switch to "menubar" window
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    # Close menubar and switch to wiki workspace
    And I wait for 0.2 seconds
    Then I switch to "preferences" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window not visible
    # Get the first wiki workspace ID and select it
    And I select "wiki" from MUI Select with test id "menubar-fixed-workspace-select"
    And I wait for 0.2 seconds
    # Open menubar window again - should show wiki workspace with browser view
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window visible
    And I confirm the "menubar" window browser view is positioned within visible window bounds
    Then I switch to "menubar" window
    And the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
    # Clean up menubar settings to avoid affecting other tests
    Then I clear test menubar settings
