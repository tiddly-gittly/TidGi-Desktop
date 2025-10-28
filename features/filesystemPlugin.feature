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

  @file-watching @subwiki
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
    # After create subwiki, webview will auto refresh here, wait for wiki to restart
    And I wait for SSE and watch-fs to be ready
    # Click on SubWiki workspace icon to open the TestTag tiddler
    When I click on a "SubWiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('SubWiki')"
    And I wait for 0.5 seconds
    # Subwiki tiddler should now be visible
    And I should see "TestTag" in the browser view content
    # create tiddler with tag
    And I click on "add tiddler button" element in browser view with selector "button[aria-label='添加条目']"
    And I wait for 0.2 seconds
    And I type "Test Tiddler Title" in "title input" element in browser view with selector "input.tc-titlebar.tc-edit-texteditor"
    And I type "TestTag" in "tag input" element in browser view with selector "input.tc-edit-texteditor.tc-popup-handle"
    And I press "Enter" in browser view
    And I click on "confirm button" element in browser view with selector "button[aria-label='确定对此条目的更改']"
    # Verify the tiddler file exists in sub-wiki folder (not in tiddlers subfolder)
    Then file "Test Tiddler Title.tid" should exist in "{tmpDir}/SubWiki"
    # Test SSE is still working after SubWiki creation - modify a main wiki tiddler
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Main wiki content modified after SubWiki creation"
    Then I wait for tiddler "Index" to be updated by watch-fs
    # Verify main wiki modification appears (Index is always open by default, no need to click)
    Then I should see "Main wiki content modified after SubWiki creation" in the browser view content
    # Test modification in sub-workspace via symlink
    # Modify the tiddler file externally - need to preserve .tid format with metadata
    When I modify file "{tmpDir}/SubWiki/Test Tiddler Title.tid" to contain "Content modified in SubWiki symlink"
    # Wait for watch-fs to detect the change
    Then I wait for tiddler "Test Tiddler Title" to be updated by watch-fs
    # Verify the modified content appears in the wiki
    Then I should see "Content modified in SubWiki symlink" in the browser view content

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

  @file-watching
  Scenario: Deleting open tiddler file shows missing tiddler message
    # Delete the Index.tid file while Index tiddler is open (it's open by default)
    When I delete file "{tmpDir}/wiki/tiddlers/Index.tid"
    Then I wait for tiddler "Index" to be deleted by watch-fs
    And I wait for 0.5 seconds
    # Verify the missing tiddler message appears in the tiddler frame
    Then I should see "佚失条目 \"Index\"" in the browser view DOM

  @file-watching
  Scenario: External file rename syncs to wiki
    # Create initial file
    When I create file "{tmpDir}/wiki/tiddlers/OldName.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: OldName
      
      Content before rename
      """
    Then I wait for tiddler "OldName" to be added by watch-fs
    # Open sidebar to see the timeline
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    And I wait for 0.5 seconds
    And I click on "timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink:has-text('OldName')"
    Then I should see "Content before rename" in the browser view content
    # Rename the file externally
    When I rename file "{tmpDir}/wiki/tiddlers/OldName.tid" to "{tmpDir}/wiki/tiddlers/NewName.tid"
    # Update the title field in the renamed file to match the new filename
    And I modify file "{tmpDir}/wiki/tiddlers/NewName.tid" to contain:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: NewName
      
      Content before rename
      """
    # Wait for the new tiddler to be detected and synced
    Then I wait for tiddler "NewName" to be updated by watch-fs
    # Navigate to timeline to verify changes
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    And I wait for 0.5 seconds
    # Verify new name appears
    And I click on "timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink:has-text('NewName')"
    Then I should see "Content before rename" in the browser view content

  @file-watching
  Scenario: External field modification syncs to wiki
    # Modify an existing tiddler file by adding a tags field to TiddlyWikiIconBlue.png
    When I modify file "{tmpDir}/wiki/tiddlers/TiddlyWikiIconBlue.png.tid" to add field "tags: TestTag"
    Then I wait for tiddler "TiddlyWikiIconBlue.png" to be updated by watch-fs
    # Open the tiddler to verify the tag was added
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    And I wait for 1 seconds
    And I click on "timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink:has-text('TiddlyWikiIconBlue.png')"
    And I wait for 1 seconds
    # Verify the tag appears in the tiddler using data attribute
    Then I should see a "TestTag tag" element in browser view with selector "[data-tiddler-title='TiddlyWikiIconBlue.png'] [data-tag-title='TestTag']"
    # Now modify Index.tid by adding a tags field
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to add field "tags: AnotherTag"
    Then I wait for tiddler "Index" to be updated by watch-fs
    And I wait for 1 seconds
    # Index is displayed by default, verify the AnotherTag appears in Index tiddler
    Then I should see a "AnotherTag tag" element in browser view with selector "[data-tiddler-title='Index'] [data-tag-title='AnotherTag']"
    # Modify favicon.ico.meta file by adding a tags field
    When I modify file "{tmpDir}/wiki/tiddlers/favicon.ico.meta" to add field "tags: IconTag"
    Then I wait for tiddler "favicon.ico" to be updated by watch-fs
    # Navigate to favicon.ico tiddler
    And I click on "sidebar tab" element in browser view with selector "div.tc-tab-buttons.tc-sidebar-tabs-main > button:has-text('最近')"
    And I wait for 0.5 seconds
    And I click on "timeline link" element in browser view with selector "div.tc-timeline a.tc-tiddlylink[href='#favicon.ico']"
    And I wait for 1 seconds
    # Verify the IconTag appears in favicon.ico tiddler
    Then I should see a "IconTag tag" element in browser view with selector "[data-tiddler-title='favicon.ico'] [data-tag-title='IconTag']"
