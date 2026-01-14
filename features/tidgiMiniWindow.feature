@tidgi-mini-window
Feature: TidGi Mini Window
  As a user
  I want to enable and use the TidGi mini window
  So that I can quickly access TidGi from the system tray

  Scenario: Enable tidgi mini window and test keyboard shortcut
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on a "tidgi mini window section" element with selector "[data-testid='preference-section-tidgiMiniWindow']"
    And I confirm the "tidgiMiniWindow" window does not exist
    When I click on an "attach to tidgi mini window switch" element with selector "[data-testid='attach-to-tidgi-mini-window-switch']"
    And I confirm the "tidgiMiniWindow" window exists
    And I confirm the "tidgiMiniWindow" window not visible
    Then I should see "always on top toggle and workspace sync toggle" elements with selectors:
      | element description      | selector                                                |
      | always on top toggle     | [data-testid='tidgi-mini-window-always-on-top-switch']  |
      | workspace sync toggle    | [data-testid='tidgi-mini-window-sync-workspace-switch'] |
    Then I click on a "shortcut register button" element with selector "[data-testid='shortcut-register-button']"
    And I press the key combination "CommandOrControl+Shift+M"
    And I click on a "shortcut confirm button" element with selector "[data-testid='shortcut-confirm-button']"
    And I close "preferences" window
    Then I switch to "main" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window exists
    And I confirm the "tidgiMiniWindow" window visible
    And I confirm the "tidgiMiniWindow" window browser view is positioned within visible window bounds
    And I switch to "tidgiMiniWindow" window
    Then the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
    Then I switch to "main" window
    And I wait for 0.2 seconds
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiMiniWindow" window exists
    And I confirm the "tidgiMiniWindow" window not visible

