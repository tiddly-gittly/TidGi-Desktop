Feature: TidGi Application Launch
  As a user
  I want to launch TidGi successfully
  So that I can use the application

  @smoke @logging
  Scenario: Application starts, shows interface, and logs work
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    And the window title should contain "太记"
    # Verify renderer logging works by navigating to preferences
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on a "sync section" element with selector "[data-testid='preference-section-sync']"
    Then I should find log entries containing
      | test-id-Preferences section clicked |
      | test-id-WorkerServicesReady |
