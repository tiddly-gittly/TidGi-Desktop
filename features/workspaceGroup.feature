Feature: Workspace Group Management
  As a user
  I want to organize my workspaces into groups
  So that I can better manage multiple workspaces

  Background:
    When I launch the TidGi application
    And I wait for the page to load completely

  @workspaceGroup @smoke
  Scenario: Create and disband workspace group by dragging
    When I wait for 0.5 seconds for "workspaces to render"
    Then I should see a "agent workspace" element with selector "[data-testid='workspace-selector-agent']"
    And I should see a "guide workspace" element with selector "[data-testid='workspace-selector-guide']"
    When I drag "agent workspace" element with selector "[data-testid='workspace-selector-agent']" to "guide workspace" element with selector "[data-testid='workspace-selector-guide']"
    And I wait for 0.5 seconds for "group creation"
    Then I should see a "workspace group" element with selector "[data-testid^='workspace-group-']"
    When I double-click on a "workspace group header" element with selector "[data-testid^='workspace-group-']"
    And I wait for 0.2 seconds for "rename input to appear"
    And I type "test group" in "group name input" element with selector "input[type='text']"
    And I press "Enter" key
    And I wait for 0.2 seconds for "rename to complete"
    When I drag "agent workspace in group" element with selector "[data-testid='workspace-selector-agent']" to "below the group" element with selector "body"
    And I wait for 0.3 seconds for "workspace to move"
    When I drag "guide workspace in group" element with selector "[data-testid='workspace-selector-guide']" to "below the group" element with selector "body"
    And I wait for 0.3 seconds for "workspace to move and group to disband"
    Then I should not see a "workspace group" element with selector "[data-testid^='workspace-group-']"

  @workspaceGroup
  Scenario: Toggle workspace group collapse and expand
    When I wait for 0.5 seconds for "workspaces to render"
    Then I should see a "agent workspace" element with selector "[data-testid='workspace-selector-agent']"
    And I should see a "guide workspace" element with selector "[data-testid='workspace-selector-guide']"
    When I drag "agent workspace" element with selector "[data-testid='workspace-selector-agent']" to "guide workspace" element with selector "[data-testid='workspace-selector-guide']"
    And I wait for 0.5 seconds for "group creation"
    When I double-click on a "workspace group header" element with selector "[data-testid^='workspace-group-']"
    And I wait for 0.2 seconds for "rename input to appear"
    And I type "test group" in "group name input" element with selector "input[type='text']"
    And I press "Enter" key
    And I wait for 0.2 seconds for "rename to complete"
    Then I should see a "agent workspace in group" element with selector "[data-testid='workspace-selector-agent']"
    And I should see a "guide workspace in group" element with selector "[data-testid='workspace-selector-guide']"
    When I click on a "workspace group header" element with selector "[data-testid^='workspace-group-']"
    And I wait for 0.2 seconds for "collapse animation"
    Then I should not see a "agent workspace in collapsed group" element with selector "[data-testid='workspace-selector-agent']"
    When I click on a "workspace group header" element with selector "[data-testid^='workspace-group-']"
    And I wait for 0.2 seconds for "expand animation"
    Then I should see a "agent workspace in expanded group" element with selector "[data-testid='workspace-selector-agent']"
