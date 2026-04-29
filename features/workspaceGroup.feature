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

  Scenario: Ungrouping workspaces and emptying groups via own-group-header drag
    When I create new wiki workspaces with names:
      | Ungroup Alpha |
      | Ungroup Beta  |
      | Ungroup Gamma |
    Given workspace group "Group Dual" contains workspaces:
      | Ungroup Alpha |
      | Ungroup Beta  |
    Given workspace group "Group Solo" contains workspaces:
      | Ungroup Gamma |
    # Test: removing from multi-item group leaves the other item grouped
    When I drag workspace "Ungroup Alpha" onto the header of its current group
    Then workspace "Ungroup Alpha" should be ungrouped
    And workspace "Ungroup Beta" should be in a group
    # Test: removing the last workspace deletes the empty group
    When I drag workspace "Ungroup Gamma" onto the header of its current group
    Then workspace "Ungroup Gamma" should be ungrouped
    And there should be 1 workspace group

  Scenario: Dragging across top, bottom, and center zones covers grouped and ungrouped targets
    When I create new wiki workspaces with names:
      | Zone Test Alpha |
      | Zone Test Beta  |
      | Zone Test Gamma |
      | Zone Test Delta |
    When I drag workspace "Zone Test Gamma" to the top zone of workspace "Zone Test Alpha"
    And workspace "Zone Test Gamma" should appear before workspace "Zone Test Alpha"
    When I drag workspace "Zone Test Gamma" to the bottom zone of workspace "Zone Test Beta"
    Then workspace "Zone Test Gamma" should appear after workspace "Zone Test Beta"
    When I drag workspace "Zone Test Alpha" onto workspace "Zone Test Beta"
    Then workspaces "Zone Test Alpha" and "Zone Test Beta" should share a group
    When I drag workspace "Zone Test Delta" to the top zone of workspace "Zone Test Alpha"
    Then workspace "Zone Test Delta" should appear before workspace "Zone Test Alpha"
    And workspaces "Zone Test Alpha" and "Zone Test Beta" should share a group
    When I hover workspace "Zone Test Delta" over workspace "Zone Test Beta"
    Then workspace "Zone Test Beta" should show "group" drag intent
    And I press "Escape" key
    Then workspace "Zone Test Delta" should be ungrouped
    And workspaces "Zone Test Alpha" and "Zone Test Beta" should share a group

  Scenario: Dragging workspace between different groups after collapsing and re-expanding the source group
    When I create new wiki workspaces with names:
      | Cross Group Alpha |
      | Cross Group Beta  |
      | Cross Group Gamma |
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
    When I create new wiki workspaces with names:
      | Group Order Alpha |
      | Group Order Beta  |
      | Group Order Gamma |
    Given workspace group "Group Order A" contains workspaces:
      | Group Order Alpha |
    Given workspace group "Group Order B" contains workspaces:
      | Group Order Beta |
    When I drag group header "Group Order B" onto group header "Group Order A"
    Then group "Group Order B" should appear before group "Group Order A"
    When I drag group header "Group Order A" onto workspace "Group Order Gamma"
    Then group "Group Order A" should appear before workspace "Group Order Gamma"
