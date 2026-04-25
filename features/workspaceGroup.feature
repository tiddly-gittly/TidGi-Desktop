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

  Scenario: Create a group by dragging one ungrouped workspace onto another
    When I create a new wiki workspace with name "Group Drag Alpha"
    And I create a new wiki workspace with name "Group Drag Beta"
    And I drag workspace "Group Drag Alpha" onto workspace "Group Drag Beta"
    Then workspaces "Group Drag Alpha" and "Group Drag Beta" should share a group
    And the group containing workspace "Group Drag Alpha" should contain 2 workspaces
    And there should be 1 workspace groups

  Scenario: Dragging a workspace onto its own group header removes it from the group
    When I create a new wiki workspace with name "Ungroup Drag Beta"
    And I create a new wiki workspace with name "Ungroup Drag Gamma"
    Given workspace group "Ungroup Drag Group" contains workspaces:
      | Ungroup Drag Beta  |
      | Ungroup Drag Gamma |
    When I drag workspace "Ungroup Drag Beta" onto the header of its current group
    Then workspace "Ungroup Drag Beta" should be ungrouped
    And workspace "Ungroup Drag Gamma" should be in a group
    And the group containing workspace "Ungroup Drag Gamma" should contain 1 workspaces
    And there should be 1 workspace groups

  Scenario: Removing one workspace without auto-disband keeps a two-item group alive
    When I create a new wiki workspace with name "Context Path Beta"
    And I create a new wiki workspace with name "Context Path Gamma"
    Given workspace group "Context Path Group" contains workspaces:
      | Context Path Beta  |
      | Context Path Gamma |
    When I remove workspace "Context Path Beta" from its group without auto-disband
    Then workspace "Context Path Beta" should be ungrouped
    And workspace "Context Path Gamma" should be in a group
    And the group containing workspace "Context Path Gamma" should contain 1 workspaces
    And there should be 1 workspace groups

  Scenario: Removing the last workspace deletes the empty group
    When I create a new wiki workspace with name "Last Workspace Gamma"
    Given workspace group "Last Workspace Group" contains workspaces:
      | Last Workspace Gamma |
    When I drag workspace "Last Workspace Gamma" onto the header of its current group
    Then workspace "Last Workspace Gamma" should be ungrouped
    And there should be 0 workspace groups

  Scenario: Dragging to top zone reorders before without grouping
    When I create a new wiki workspace with name "Zone Test Alpha"
    And I create a new wiki workspace with name "Zone Test Beta"
    And I create a new wiki workspace with name "Zone Test Gamma"
    When I drag workspace "Zone Test Gamma" to the top zone of workspace "Zone Test Alpha"
    Then workspace "Zone Test Gamma" should be ungrouped
    And workspace "Zone Test Alpha" should be ungrouped
    And workspace "Zone Test Gamma" should appear before workspace "Zone Test Alpha"

  Scenario: Dragging to bottom zone reorders after without grouping
    When I create a new wiki workspace with name "Zone Bottom Alpha"
    And I create a new wiki workspace with name "Zone Bottom Beta"
    And I create a new wiki workspace with name "Zone Bottom Gamma"
    When I drag workspace "Zone Bottom Alpha" to the bottom zone of workspace "Zone Bottom Gamma"
    Then workspace "Zone Bottom Alpha" should be ungrouped
    And workspace "Zone Bottom Gamma" should be ungrouped
    And workspace "Zone Bottom Alpha" should appear after workspace "Zone Bottom Gamma"

  Scenario: Dragging to center zone creates a group
    When I create a new wiki workspace with name "Zone Center Alpha"
    And I create a new wiki workspace with name "Zone Center Beta"
    When I drag workspace "Zone Center Alpha" onto workspace "Zone Center Beta"
    Then workspaces "Zone Center Alpha" and "Zone Center Beta" should share a group
    And the group containing workspace "Zone Center Alpha" should contain 2 workspaces

  Scenario: Hovering a workspace over another shows combine intent on the target
    When I create a new wiki workspace with name "Hover Highlight Alpha"
    And I create a new wiki workspace with name "Hover Highlight Beta"
    And I hover workspace "Hover Highlight Alpha" over workspace "Hover Highlight Beta"
    Then workspace "Hover Highlight Beta" should show "group" drag intent
    And I release the mouse

  Scenario: Preferences search finds workspace group management
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I type "workspace group" in "search input" element with selector "[data-testid='preferences-search-input'] input"
    Then I should see a "workspace group management" element with selector "[data-testid='create-group-button']"
