Feature: Wiki navigation retains its preload bridge
  @wikiNavigation
  Scenario: Reloading a saved fragment creates a new document with working services
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
      | enableHTTPAPI         | true  |
      | port                  | 15212 |
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And reloading a different saved wiki fragment should recreate the document and its services

  @wikiFolderAccess
  Scenario: Folder checking identifies the workspace and clears when access finishes
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then the browser view should be loaded and visible
    And a pending folder check should name its workspace and clear without an approval action
