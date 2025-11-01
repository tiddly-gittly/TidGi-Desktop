@tidgi-mini-window
Feature: TidGi Mini Window Workspace Switching
  As a user with tidgi mini window already enabled
  I want to test tidgi mini window behavior with different workspace configurations
  So that I can verify workspace switching and fixed workspace features

  Background:
    Given I configure tidgi mini window with shortcut
    Given I cleanup test wiki so it could create a new one on start
    Then I launch the TidGi application
    And I wait for the page to load completely
    Then I switch to "main" window

  Scenario: TidGi mini window syncs with main window switching to agent workspace
    # Switch main window to agent workspace
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    # Verify tidgi mini window exists in background (created but not visible)
    And I wait for 0.2 seconds
    Then I confirm the "tidgiMiniWindow" window exists
    And I confirm the "tidgiMiniWindow" window not visible
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window visible
    And I confirm the "tidgiMiniWindow" window browser view is not positioned within visible window bounds
    Then I switch to "tidgiMiniWindow" window
    # In sync mode, browser view shows the current active workspace (agent), sidebar is hidden
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  Scenario: TidGi mini window with fixed agent workspace shows no view and fixed wiki workspace shows browser view
    # Configure fixed agent workspace through UI
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on "tidgi mini window section and disable sync workspace switch" elements with selectors:
      | [data-testid='preference-section-tidgiMiniWindow']                |
      | [data-testid='tidgi-mini-window-sync-workspace-switch']           |
    # Enable sidebar to see workspace buttons
    And I click on a "Enable sidebar toggle switch" element with selector "[data-testid='sidebar-on-tidgi-mini-window-switch']"
    And I wait for 0.2 seconds
    # Select agent workspace (which is a page type workspace)
    And I select "agent" from MUI Select with test id "tidgi-mini-window-fixed-workspace-select"
    # Open tidgi mini window - should show agent workspace and no browser view
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window visible
    And I confirm the "tidgiMiniWindow" window browser view is not positioned within visible window bounds
    Then I switch to "tidgiMiniWindow" window
    # Verify sidebar is visible
    And I should see a "main sidebar" element with selector "[data-testid='main-sidebar']"
    # Verify agent workspace is active
    And I should see a "agent workspace active button" element with selector "[data-testid='workspace-agent'][data-active='true']"
    # Close tidgi mini window and switch to wiki workspace
    And I wait for 0.2 seconds
    Then I switch to "preferences" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window not visible
    # Get the first wiki workspace ID and select it
    And I select "wiki" from MUI Select with test id "tidgi-mini-window-fixed-workspace-select"
    And I wait for 0.2 seconds
    # Open tidgi mini window again - should show wiki workspace with browser view
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window visible
    And I confirm the "tidgiMiniWindow" window browser view is positioned within visible window bounds
    Then I switch to "tidgiMiniWindow" window
    # Verify sidebar is visible
    And I should see a "main sidebar" element with selector "[data-testid='main-sidebar']"
    # Verify browser view content is visible and wiki workspace is active
    And I should see "我的 TiddlyWiki" in the browser view content
    And I should see a "wiki workspace active button" element with selector "[data-active='true']"

  Scenario: Enabling sync workspace automatically hides sidebar
    # Configure tidgi mini window with fixed workspace first
    When I click on "agent workspace button and open preferences button" elements with selectors:
      | [data-testid='workspace-agent']       |
      | #open-preferences-button              |
    And I switch to "preferences" window
    When I click on "tidgi mini window section and disable sync workspace switch" elements with selectors:
      | [data-testid='preference-section-tidgiMiniWindow']                |
      | [data-testid='tidgi-mini-window-sync-workspace-switch']           |
    And I should see a "sidebar toggle switch" element with selector "[data-testid='sidebar-on-tidgi-mini-window-switch']"
    # Enable sidebar to see it in mini window
    And I click on a "Enable sidebar toggle switch" element with selector "[data-testid='sidebar-on-tidgi-mini-window-switch']"
    # Open tidgi mini window and verify sidebar is visible
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window visible
    And I switch to "tidgiMiniWindow" window
    And I should see a "main sidebar" element with selector "[data-testid='main-sidebar']"
    # Close mini window and go back to preferences
    Then I switch to "preferences" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window not visible
    # Now enable sync workspace - should automatically hide sidebar
    When I click on a "Enable tidgi mini window sync workspace switch" element with selector "[data-testid='tidgi-mini-window-sync-workspace-switch']"
    # Verify sidebar option is now hidden
    And I should not see "sidebar toggle switch and fixed workspace select" elements with selectors:
      | [data-testid='sidebar-on-tidgi-mini-window-switch']        |
      | [data-testid='tidgi-mini-window-fixed-workspace-select']   |
    # Open tidgi mini window in sync mode - should sync to agent workspace
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window visible
    And I switch to "tidgiMiniWindow" window
    # In sync mode, sidebar should not be visible (automatically hidden)
    And I should not see a "main sidebar" element with selector "[data-testid='main-sidebar']"

  Scenario: Clicking workspace button in mini window updates fixed workspace ID
    # First click on guide workspace in main window to set a different active workspace
    Then I switch to "main" window
    When I click on a "guide workspace button" element with selector "[data-testid='workspace-guide']"
    And I wait for 0.2 seconds
    # Configure tidgi mini window with fixed workspace
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on "tidgi mini window section and disable sync workspace switch" elements with selectors:
      | [data-testid='preference-section-tidgiMiniWindow']                |
      | [data-testid='tidgi-mini-window-sync-workspace-switch']           |
    # Enable sidebar to see workspace buttons
    And I click on a "Enable sidebar toggle switch" element with selector "[data-testid='sidebar-on-tidgi-mini-window-switch']"
    And I wait for 0.2 seconds
    # Select agent workspace as fixed workspace
    And I select "agent" from MUI Select with test id "tidgi-mini-window-fixed-workspace-select"
    And I wait for 0.2 seconds
    # Open tidgi mini window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window visible
    Then I switch to "tidgiMiniWindow" window
    # Verify agent workspace is active initially
    And I should see a "agent workspace button with active state" element with selector "[data-testid='workspace-agent'][data-active='true']"
    # Click on guide workspace button to update fixed workspace ID
    When I click on a "guide workspace button" element with selector "[data-testid='workspace-guide']"
    And I wait for 0.2 seconds
    # Verify guide workspace is now active and agent workspace is no longer active
    And I should see "guide workspace button with active state and agent workspace button without active state" elements with selectors:
      | [data-testid='workspace-guide'][data-active='true']  |
      | [data-testid='workspace-agent'][data-active='false'] |