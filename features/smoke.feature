Feature: TidGi Application Launch
  As a user
  I want to launch TidGi successfully
  So that I can use the application

  @smoke
  Scenario: Application starts and shows interface
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    And the window title should contain "太记"
