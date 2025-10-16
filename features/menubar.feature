Feature: TidGi Menubar Window
  As a user
  I want to enable and use the TidGi menubar window
  So that I can quickly access TidGi from the system menubar

  Scenario: Enable menubar window and test keyboard shortcut
    Given I launch the TidGi application
    When I wait for the page to load completely
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on a "menubar section" element with selector "[data-testid='preference-section-menubar']"
    And I confirm the "menubar" window does not exist
    And I click on an "attach to menubar switch" element with selector "[data-testid='attach-to-menubar-switch']"
    And I wait for 2 seconds
    And I confirm the "menubar" window exists but not visible
    Then I should see "sidebar toggle and always on top toggle and workspace sync toggle" elements with selectors:
      | [data-testid='sidebar-on-menubar-switch'] |
      | [data-testid='menubar-always-on-top-switch'] |
      | [data-testid='menubar-sync-workspace-switch'] |
    And I click on a "shortcut register button" element with selector "[data-testid='shortcut-register-button']"
    And I press the key combination "CommandOrControl+Shift+M"
    And I click on a "shortcut confirm button" element with selector "[data-testid='shortcut-confirm-button']"
    And I close "preferences" window
    And I wait for 0.2 seconds
    And I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window exists and visible
    And I wait for 0.2 seconds
    And I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window exists but not visible