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

  Scenario: Dragging a workspace onto its own group header removes it from the group
    When I create a new wiki workspace with name "Ungroup Drag Beta"
    And I create a new wiki workspace with name "Ungroup Drag Gamma"
    Given workspace group "Ungroup Drag Group" contains workspaces:
      | Ungroup Drag Beta  |
      | Ungroup Drag Gamma |
    When I drag workspace "Ungroup Drag Beta" onto the header of its current group
    Then workspace "Ungroup Drag Beta" should be ungrouped
    And workspace "Ungroup Drag Gamma" should be in a group

  Scenario: Removing the last workspace deletes the empty group
    When I create a new wiki workspace with name "Last Workspace Gamma"
    Given workspace group "Last Workspace Group" contains workspaces:
      | Last Workspace Gamma |
    When I drag workspace "Last Workspace Gamma" onto the header of its current group
    Then workspace "Last Workspace Gamma" should be ungrouped
    And there should be 0 workspace groups

  Scenario: Dragging across top, bottom, and center zones covers grouped and ungrouped targets
    When I create a new wiki workspace with name "Zone Test Alpha"
    And I create a new wiki workspace with name "Zone Test Beta"
    And I create a new wiki workspace with name "Zone Test Gamma"
    And I create a new wiki workspace with name "Zone Test Delta"
    When I drag workspace "Zone Test Gamma" to the top zone of workspace "Zone Test Alpha"
    And workspace "Zone Test Gamma" should appear before workspace "Zone Test Alpha"
    When I drag workspace "Zone Test Gamma" to the bottom zone of workspace "Zone Test Beta"
    Then workspace "Zone Test Gamma" should appear after workspace "Zone Test Beta"
    When I drag workspace "Zone Test Alpha" onto workspace "Zone Test Beta"
    Then workspaces "Zone Test Alpha" and "Zone Test Beta" should share a group
    When I drag workspace "Zone Test Delta" to the top zone of workspace "Zone Test Alpha"
    Then workspace "Zone Test Delta" should appear before workspace "Zone Test Alpha"
    And workspaces "Zone Test Alpha" and "Zone Test Beta" should share a group

  Scenario: Canceling a drag with Escape key leaves workspaces unchanged
    When I create a new wiki workspace with name "Cancel Drag Alpha"
    And I create a new wiki workspace with name "Cancel Drag Beta"
    And I hover workspace "Cancel Drag Alpha" over workspace "Cancel Drag Beta"
    And I press "Escape" key
    Then workspace "Cancel Drag Alpha" should be ungrouped
    And workspace "Cancel Drag Beta" should be ungrouped

  Scenario: Dragging workspace between different groups after collapsing and re-expanding the source group
    When I create a new wiki workspace with name "Cross Group Alpha"
    And I create a new wiki workspace with name "Cross Group Beta"
    And I create a new wiki workspace with name "Cross Group Gamma"
    Given workspace group "Cross Group A" contains workspaces:
      | Cross Group Alpha |
      | Cross Group Beta  |
    Given workspace group "Cross Group B" contains workspaces:
      | Cross Group Gamma |
    When I collapse workspace group "Cross Group A"
    And I expand workspace group "Cross Group A"
    And I drag workspace "Cross Group Alpha" onto workspace "Cross Group Gamma"
    Then workspaces "Cross Group Alpha" and "Cross Group Gamma" should share a group
    And workspace "Cross Group Beta" should be in a group

  Scenario: Reordering group headers and positioning before ungrouped workspaces
    When I create a new wiki workspace with name "Group Order Alpha"
    And I create a new wiki workspace with name "Group Order Beta"
    And I create a new wiki workspace with name "Group Order Gamma"
    Given workspace group "Group Order A" contains workspaces:
      | Group Order Alpha |
    Given workspace group "Group Order B" contains workspaces:
      | Group Order Beta |
    When I drag group header "Group Order B" onto group header "Group Order A"
    Then group "Group Order B" should appear before group "Group Order A"
    When I drag group header "Group Order A" onto workspace "Group Order Gamma"
    Then group "Group Order A" should appear before workspace "Group Order Gamma"

  Scenario: Hovering a workspace over another shows combine intent on the target
    When I create a new wiki workspace with name "Hover Highlight Alpha"
    And I create a new wiki workspace with name "Hover Highlight Beta"
    And I hover workspace "Hover Highlight Alpha" over workspace "Hover Highlight Beta"
    Then workspace "Hover Highlight Beta" should show "group" drag intent
    And I release the mouse
