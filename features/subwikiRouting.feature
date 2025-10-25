@subwiki-routing
Feature: Sub-Wiki Tag-Based Routing
  As a user
  I want tiddlers with specific tags to be saved to sub-wikis automatically
  So that I can organize content across wikis

  Scenario: Tiddler with tag saves to sub-wiki folder
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    # At this point, default wiki workspace is already created
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Create sub-workspace linked to the default wiki
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    # Toggle to sub-workspace mode by clicking the switch
    And I click on a "main/sub workspace switch" element with selector "input[type='checkbox']"
    # Select the first (default) wiki workspace from dropdown
    And I select "wiki" from MUI Select with test id "main-wiki-select"
    # Type folder name
    And I type "SubWiki" in "sub wiki folder name input" element with selector "input[aria-describedby*='-helper-text'][value='wiki']"
    And I type "TestTag" in "tag name input" element with selector "[data-testid='tagname-autocomplete-input']"
    And I click on a "create sub workspace button" element with selector "button.MuiButton-colorSecondary"
    And I switch to "main" window
    Then I should see a "SubWiki workspace" element with selector "div[data-testid^='workspace-']:has-text('SubWiki')"
    # Switch to default wiki and create tiddler with tag
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Create tiddler in browser view
    And I click on element with selector "button[aria-label='添加条目']" in browser view
    And I wait for 0.2 seconds
    And I type "Test Tiddler Title" in element with selector "input.tc-titlebar.tc-edit-texteditor" in browser view
    And I type "TestTag" in element with selector "input.tc-edit-texteditor.tc-popup-handle" in browser view
    And I press "Enter" in browser view
    And I click on element with selector "button[aria-label='确定对此条目的更改']" in browser view
    # Verify the tiddler file exists in sub-wiki folder (not in tiddlers subfolder)
    Then file "Test Tiddler Title.tid" should exist in "{tmpDir}/SubWiki"
