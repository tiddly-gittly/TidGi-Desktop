@workspace-group
Feature: Workspace Grouping
  As a user with multiple workspaces
  I want to organize them into groups
  So that I can manage them more efficiently

  Background:
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely
    And the browser view should be loaded and visible

  Scenario: Create and manage workspace groups
    # Open group management dialog
    When I click on a "manage groups button" element with selector "[data-testid='manage-groups-button']"
    Then I should see a "create group button" element with selector "[data-testid='create-group-button']"
    
    # Create a new group
    When I click on a "create group button" element with selector "[data-testid='create-group-button']"
    And I type "Work Projects" into the focused input
    And I press "Enter"
    Then I should see a "group name" element with selector ":has-text('Work Projects')"
    
    # Close dialog
    When I click on a "close dialog button" element with selector "button:has-text('Close')"
    
    # Verify group appears in sidebar
    Then I should see a "workspace group" element with selector "[data-testid^='workspace-group-']"

  Scenario: Inspect workspace group DOM structure
    # Create a test group first
    When I click on a "manage groups button" element with selector "[data-testid='manage-groups-button']"
    When I click on a "create group button" element with selector "[data-testid='create-group-button']"
    And I type "Test Group" into the focused input
    And I press "Enter"
    When I click on a "close dialog button" element with selector "button:has-text('Close')"
    
    # Verify DOM structure
    Then I should see a "workspace group element" element with selector "[data-testid^='workspace-group-']"
    Then I should see a "default workspace item" element with selector "[data-testid^='workspace-item-']"
