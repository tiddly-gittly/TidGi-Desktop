Feature: Filesystem Plugin
  As a user
  I want tiddlers with specific tags to be saved to sub-wikis automatically
  So that I can organize content across wikis

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready

  @subwiki
  Scenario: Tiddler with tag saves to sub-wiki folder
    # Create sub-workspace linked to the default wiki
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    # Toggle to sub-workspace mode by clicking the switch
    And I click on a "main/sub workspace switch" element with selector "[data-testid='main-sub-workspace-switch']"
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
    And I click on "add tiddler button" element in browser view with selector "button[aria-label='添加条目']"
    And I wait for 0.2 seconds
    And I type "Test Tiddler Title" in "title input" element in browser view with selector "input.tc-titlebar.tc-edit-texteditor"
    And I type "TestTag" in "tag input" element in browser view with selector "input.tc-edit-texteditor.tc-popup-handle"
    And I press "Enter" in browser view
    And I click on "confirm button" element in browser view with selector "button[aria-label='确定对此条目的更改']"
    # Verify the tiddler file exists in sub-wiki folder (not in tiddlers subfolder)
    Then file "Test Tiddler Title.tid" should exist in "{tmpDir}/SubWiki"

  @file-watching
  Scenario: External file creation syncs to wiki
    # Create a test tiddler file directly on filesystem
    When I create file "{tmpDir}/wiki/tiddlers/WatchTestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: WatchTestTiddler
      
      Initial content from filesystem
      """
    # Wait for watch-fs to detect and add the tiddler
    Then I wait for tiddler "WatchTestTiddler" to be added by watch-fs
    # Open sidebar "最近" tab to see the timeline
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    And I wait for 0.5 seconds
    # Click on the tiddler link in timeline to open it
    And I click on "timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink:has-text('WatchTestTiddler')"
    # Verify the tiddler content is displayed
    Then I should see "Initial content from filesystem" in the browser view content

  @file-watching
  Scenario: External file modification and deletion sync to wiki  
    # Create initial file
    When I create file "{tmpDir}/wiki/tiddlers/TestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: TestTiddler
      
      Original content
      """
    Then I wait for tiddler "TestTiddler" to be added by watch-fs
    # Open the tiddler to view it
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    And I wait for 0.5 seconds
    And I click on "timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink:has-text('TestTiddler')"
    Then I should see "Original content" in the browser view content
    # Modify the file externally
    When I modify file "{tmpDir}/wiki/tiddlers/TestTiddler.tid" to contain "Modified content from external editor"
    Then I wait for tiddler "TestTiddler" to be updated by watch-fs
    # Verify the wiki shows updated content (should auto-refresh)
    Then I should see "Modified content from external editor" in the browser view content
    # Now delete the file externally
    When I delete file "{tmpDir}/wiki/tiddlers/TestTiddler.tid"
    Then I wait for tiddler "TestTiddler" to be deleted by watch-fs
    # Re-open timeline to see updated list
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    # The timeline should not have a clickable link to TestTiddler anymore
    Then I should not see a "TestTiddler timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink:has-text('TestTiddler')"

