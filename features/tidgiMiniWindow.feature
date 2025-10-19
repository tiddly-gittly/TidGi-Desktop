@tidgiminiwindow
Feature: TidGi Mini Window
  As a user
  I want to enable and use the TidGi mini window
  So that I can quickly access TidGi from the system tray

  Scenario: Enable tidgi mini window and test keyboard shortcut
    Given I cleanup test wiki
    And I launch the TidGi application
    And I wait for the page to load completely
    And I click on an "open preferences button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    When I click on a "tidgi mini window section" element with selector "[data-testid='preference-section-tidgiMiniWindow']"
    And I confirm the "tidgiminiwindow" window does not exist
    When I click on an "attach to tidgi mini window switch" element with selector "[data-testid='attach-to-tidgi-mini-window-switch']"
    And I confirm the "tidgiminiwindow" window exists
    And I confirm the "tidgiminiwindow" window not visible
    Then I should see "sidebar toggle and always on top toggle and workspace sync toggle" elements with selectors:
      | [data-testid='sidebar-on-tidgi-mini-window-switch'] |
      | [data-testid='tidgi-mini-window-always-on-top-switch'] |
      | [data-testid='tidgi-mini-window-sync-workspace-switch'] |
    Then I click on a "shortcut register button" element with selector "[data-testid='shortcut-register-button']"
    And I press the key combination "CommandOrControl+Shift+M"
    And I click on a "shortcut confirm button" element with selector "[data-testid='shortcut-confirm-button']"
    And I close "preferences" window
    Then I switch to "main" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I confirm the "tidgiminiwindow" window exists
    And I confirm the "tidgiminiwindow" window visible
    And I confirm the "tidgiminiwindow" window browser view is positioned within visible window bounds
    And I switch to "tidgiminiwindow" window
    Then the browser view should be loaded and visible
    And I should see "我的 TiddlyWiki" in the browser view content
    Then I switch to "main" window
    When I press the key combination "CommandOrControl+Shift+M"
    And I wait for 2 seconds
    And I confirm the "tidgiminiwindow" window exists
    And I confirm the "tidgiminiwindow" window not visible
