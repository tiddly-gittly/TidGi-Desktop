Feature: TidGi Default Wiki
  As a user
  I want app auto create a default wiki workspace for me
  So that I can start using wiki immediately

  @wiki
  Scenario: Application starts and shows interface
    When I launch the TidGi application
    And I wait for the page to load completely
  And I should see a "page body" element with selector "body"
  And the window title should contain "太记"
  And I should see a "wiki workspace" element with selector "text=wiki"
