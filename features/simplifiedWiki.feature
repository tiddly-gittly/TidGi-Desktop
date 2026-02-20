Feature: Simplified Main Wiki Workspace
  As a user
  I want a default wiki converted into simplified structure to still work
  So that root-level tiddlers and files folder assets can both load correctly

  Background:
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application

  @wiki @simplified-main-wiki
  Scenario: Convert default wiki to simplified structure
    And I wait for the page to load completely
    Then file "wiki/tiddlywiki.info" should exist in "wiki-test"
    And I close the TidGi application
    When I flatten default wiki to simplified root structure
    Then file "wiki/tiddlywiki.info" should not exist in "wiki-test"
    And I launch the TidGi application
    And I wait for the page to load completely
    And I switch to "main" window
    Then file "wiki/tidgi.config.json" should exist in "wiki-test"
    # Prevent Log has Found 0 existing wiki workspaces
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    And file "wiki/tidgi.config.json" should contain JSON with:
      | jsonPath | value |
      | $.name   | wiki  |
    # Should wait until real wiki content loaded, like side bar tab caption
    And the browser view should be loaded and visible
    And I should see "最近" in the browser view content
    When I open tiddler "TiddlyWikiIconBlue.png" in browser view
    Then image "TiddlyWikiIconBlue.png" should be loaded in browser view
