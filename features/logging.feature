Feature: Renderer logging to backend (UI-driven)
  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely

  @logging
  Scenario: Renderer emits expected logs during normal flows
    When I open Preferences and go to Sync
    Then I should see the Git token input
    When I open an Agent chat and trigger a cancel during streaming
    # Frontend use `void window.service.native.log` to log to file.
    Then I should find log entries containing
      | get user name and email using github api | 
      | Store userInfo | 
