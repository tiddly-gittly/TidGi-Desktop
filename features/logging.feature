Feature: Renderer logging to backend (UI-driven)
  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely

  @logging
  Scenario: Renderer logs appear in backend log file
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on a "sync section" element with selector "[data-testid='preference-section-sync']"
    Then I should find log entries containing
      | Preferences section clicked |
