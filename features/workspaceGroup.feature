Feature: Workspace Grouping
  As a user with multiple workspaces
  I want to organize them into groups
  So that I can manage them more efficiently

  Background:
    Given the application is launched
    And I wait for the main window to be visible

  Scenario: Create a new workspace group
    When I click the element with data-testid "manage-groups-button"
    Then I should see the element with data-testid "create-group-button"
    When I click the element with data-testid "create-group-button"
    And I type "Work Projects" into the focused input
    And I press "Enter"
    Then I should see the element with text "Work Projects"

  Scenario: Rename a workspace group
    Given a workspace group "Personal" exists
    When I click the element with data-testid "manage-groups-button"
    And I click the element with data-testid "edit-group-{groupId}"
    And I clear the focused input
    And I type "Personal Projects" into the focused input
    And I press "Enter"
    Then I should see the element with text "Personal Projects"

  Scenario: Delete a workspace group
    Given a workspace group "Temporary" exists
    When I click the element with data-testid "manage-groups-button"
    And I click the element with data-testid "delete-group-{groupId}"
    And I confirm the dialog
    Then I should not see the element with text "Temporary"

  Scenario: Move workspace to group via drag and drop
    Given a workspace group "Development" exists
    And a workspace "My Wiki" exists without a group
    When I drag the workspace "My Wiki" to the group "Development"
    Then the workspace "My Wiki" should be in the group "Development"

  Scenario: Collapse and expand workspace group
    Given a workspace group "Projects" exists with workspaces
    When I click the group header "Projects"
    Then the group "Projects" should be collapsed
    And the workspaces in "Projects" should not be visible
    When I click the group header "Projects" again
    Then the group "Projects" should be expanded
    And the workspaces in "Projects" should be visible

  Scenario: Reorder workspace groups
    Given workspace groups "Group A" and "Group B" exist
    When I drag the group "Group B" above "Group A"
    Then "Group B" should appear before "Group A" in the sidebar

  Scenario: Ungrouped workspaces appear at top
    Given a workspace group "Archived" exists
    And a workspace "Quick Notes" exists without a group
    Then the workspace "Quick Notes" should appear before the group "Archived"

  Scenario: Inspect workspace group DOM structure
    Given a workspace group "Test Group" exists with 2 workspaces
    Then the element with data-testid "workspace-group-{groupId}" should exist
    And the group should contain 2 workspace items
    And each workspace should have data-testid "workspace-item-{workspaceId}"
