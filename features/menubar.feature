Feature: TidGi Menubar Window
  As a user
  I want to enable and use the TidGi menubar window
  So that I can quickly access TidGi from the system menubar

  Scenario: Enable menubar window and test keyboard shortcut
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on a "menubar section" element with selector "[data-testid='preference-section-menubar']"
    And I confirm the "menubar" window does not exist
    When I click on an "attach to menubar switch" element with selector "[data-testid='attach-to-menubar-switch']"
    And I confirm the "menubar" window exists
    And I confirm the "menubar" window not visible
    Then I should see "sidebar toggle and always on top toggle and workspace sync toggle" elements with selectors:
      | [data-testid='sidebar-on-menubar-switch'] |
      | [data-testid='menubar-always-on-top-switch'] |
      | [data-testid='menubar-sync-workspace-switch'] |
    Then I click on a "shortcut register button" element with selector "[data-testid='shortcut-register-button']"
    And I press the key combination "CommandOrControl+Shift+M"
    And I click on a "shortcut confirm button" element with selector "[data-testid='shortcut-confirm-button']"
    And I close "preferences" window
    Then I switch to "main" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "menubar" window exists
    And I confirm the "menubar" window visible
    And I confirm the "menubar" window browser view is positioned within visible window bounds
    And I switch to "menubar" window
    Then the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
    Then I switch to "main" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I wait for 2 seconds
    And I confirm the "menubar" window exists
    And I confirm the "menubar" window not visible
