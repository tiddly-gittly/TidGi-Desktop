Feature: Analytics Event Tracking
  As a developer
  I want to verify that analytics events are correctly sent
  So that I can ensure the tracking system works as expected

  Background:
    Given I start mock analytics server

  @smoke @analytics
  Scenario: Application launch sends app.launched event with retention properties
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    Then I should see analytics events:
      | event_name   | platform   | version    | firstLaunchDate | isFirstLaunch |
      | app.launched | *string*   | *string*   | *exists*        | *boolean*     |

  @analytics
  Scenario: Opening preferences sends settings.opened event
    When I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    When I reset mock analytics events
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    Then I should see analytics events:
      | event_name      | window        |
      | settings.opened | preferences   |

  @analytics @workspace
  Scenario: Auto-created workspace sends workspace.created event on launch
    When I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    Then I should see analytics events:
      | event_name        | isSubWiki | hasGitUrl |
      | workspace.created | *boolean* | *boolean* |
