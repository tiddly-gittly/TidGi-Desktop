Feature: Sub-Wiki Functionality
  As a user
  I want sub-wikis to properly load tiddlers on startup
  And I want to use tag tree filtering to organize tiddlers into sub-wikis
  So that my content is automatically organized


  @file-watching @subwiki
  Scenario: Tiddler with tag saves to sub-wiki folder
    # Setup: Create sub-wiki with tag BEFORE launching the app (fast setup)
    Given I cleanup test wiki so it could create a new one on start
    And I setup a sub-wiki "SubWiki" with tag "TestTag" and tiddlers:
      | title   | tags    | content           |
      | TestTag | TestTag | Tag tiddler stub  |
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see "page body and workspaces" elements with selectors:
      | div[data-testid^='workspace-']:has-text('wiki')    |
      | div[data-testid^='workspace-']:has-text('SubWiki') |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Create tiddler with tag to test file system plugin
    And I click on "add tiddler button" element in browser view with selector "button:has(.tc-image-new-button)"
    # Focus on title input, clear it, and type new title in the draft tiddler
    And I click on "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I wait for 0.2 seconds
    And I press "Control+a" in browser view
    And I wait for 0.2 seconds
    And I press "Delete" in browser view
    And I type "TestTiddlerTitle" in "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    # Wait for tiddler state to settle, otherwise it still shows 3 chars (新条目) for a while
    And I wait for 2 seconds
    Then I should see "16 chars" in the browser view content
    # Input tag by typing in the tag input field - use precise selector to target the tag input specifically
    And I click on "tag input" element in browser view with selector "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']"
    And I wait for 0.2 seconds
    And I press "Control+a" in browser view
    And I wait for 0.2 seconds
    And I press "Delete" in browser view
    And I wait for 0.2 seconds
    And I type "TestTag" in "tag input" element in browser view with selector "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']"
    # Click the add tag button to confirm the tag (not just typing)
    And I wait for 0.2 seconds
    And I click on "add tag button" element in browser view with selector "div[data-tiddler-title^='Draft of'] span.tc-add-tag-button button"
    # Wait for file system plugin to save the draft tiddler to SubWiki folder, Even 3 second will randomly failed in next step.
    And I wait for 4.5 seconds
    # Verify the DRAFT tiddler has been routed to sub-wiki immediately after adding the tag
    Then file "Draft of '新条目'.tid" should exist in "{tmpDir}/SubWiki"
    # Verify the draft file is NOT in main wiki tiddlers folder (it should have been moved to SubWiki)
    Then file "Draft of '新条目'.tid" should not exist in "{tmpDir}/wiki/tiddlers"
    # Click confirm button to save the tiddler
    And I click on "confirm button" element in browser view with selector "button:has(.tc-image-done-button)"
    And I wait for 1 seconds
    # Verify the final tiddler file exists in sub-wiki folder after save
    # After confirming the draft, it should be saved as TestTiddlerTitle.tid in SubWiki
    Then file "TestTiddlerTitle.tid" should exist in "{tmpDir}/SubWiki"
    # Test SSE is still working after SubWiki creation - modify a main wiki tiddler
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Main wiki content modified after SubWiki creation"
    Then I wait for tiddler "Index" to be updated by watch-fs
    # Confirm Index always open
    Then I should see a "Index tiddler" element in browser view with selector "div[data-tiddler-title='Index']"
    Then I should see "Main wiki content modified after SubWiki creation" in the browser view content
    # Test modification in sub-wiki folder - tiddler was routed there by tag
    # Modify the tiddler file externally - need to preserve .tid format with metadata
    When I modify file "{tmpDir}/SubWiki/TestTiddlerTitle.tid" to contain "Content modified in SubWiki folder"
    # Wait for watch-fs to detect the change - use longer wait and open tiddler directly
    And I wait for 2 seconds for "watch-fs to detect file change in sub-wiki"
    # Open the tiddler directly to verify content was updated
    When I open tiddler "TestTiddlerTitle" in browser view
    And I wait for 1 seconds
    # Verify the modified content appears in the wiki
    Then I should see "Content modified in SubWiki folder" in the browser view content

  @subwiki @subwiki-load
  Scenario: Sub-wiki tiddlers are loaded on initial wiki startup
    # Setup: Create sub-wiki folder and settings BEFORE launching the app
    Given I cleanup test wiki so it could create a new one on start
    And I setup a sub-wiki "SubWikiPreload" with tag "PreloadTag" and tiddlers:
      | title               | tags       | content                                     |
      | PreExistingTiddler  | PreloadTag | Content from pre-existing sub-wiki tiddler  |
    # Now launch the app - it should load both main wiki and sub-wiki tiddlers
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see "page body and workspaces" elements with selectors:
      | div[data-testid^='workspace-']:has-text('wiki')           |
      | div[data-testid^='workspace-']:has-text('SubWikiPreload') |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Open the tiddler directly using TiddlyWiki API
    When I open tiddler "PreExistingTiddler" in browser view
    And I wait for 0.5 seconds
    # Verify the tiddler content is displayed
    Then I should see "Content from pre-existing sub-wiki tiddler" in the browser view content
    # Verify the tiddler has the correct tag
    Then I should see a "PreloadTag tag" element in browser view with selector "[data-tiddler-title='PreExistingTiddler'] [data-tag-title='PreloadTag']"

  @subwiki @subwiki-tagtree
  Scenario: Tiddlers matching tag tree are routed to sub-wiki with includeTagTree enabled
    # Setup: Create sub-wiki with includeTagTree enabled, and pre-existing tag hierarchy A->B
    # TagTreeRoot is the sub-wiki's tagName
    # TiddlerA has tag "TagTreeRoot" (direct child)
    # TiddlerB has tag "TiddlerA" (grandchild via tag tree)
    Given I cleanup test wiki so it could create a new one on start
    And I setup a sub-wiki "SubWikiTagTree" with tag "TagTreeRoot" and includeTagTree enabled and tiddlers:
      | title     | tags        | content                        |
      | TiddlerA  | TagTreeRoot | TiddlerA with TagTreeRoot tag  |
      | TiddlerB  | TiddlerA    | TiddlerB with TiddlerA tag     |
    # Now launch the app
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see "page body and workspaces" elements with selectors:
      | div[data-testid^='workspace-']:has-text('wiki')           |
      | div[data-testid^='workspace-']:has-text('SubWikiTagTree') |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Verify TiddlerA and TiddlerB were loaded from sub-wiki by opening them
    When I open tiddler "TiddlerA" in browser view
    And I wait for 0.5 seconds
    Then I should see "TiddlerA with TagTreeRoot tag" in the browser view content
    When I open tiddler "TiddlerB" in browser view
    And I wait for 0.5 seconds
    Then I should see "TiddlerB with TiddlerA tag" in the browser view content
    # Now create TiddlerC with tag TiddlerB (testing tag tree routing: TiddlerC -> TiddlerB -> TiddlerA -> TagTreeRoot)
    And I click on "add tiddler button" element in browser view with selector "button:has(.tc-image-new-button)"
    And I click on "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I wait for 0.2 seconds
    And I press "Control+a" in browser view
    And I wait for 0.2 seconds
    And I press "Delete" in browser view
    And I type "TiddlerC" in "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I wait for 0.5 seconds
    # Add TiddlerB as a tag (testing tag tree traversal: TiddlerC -> TiddlerB -> TiddlerA -> TagTreeRoot)
    And I click on "tag input" element in browser view with selector "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']"
    And I wait for 0.2 seconds
    And I type "TiddlerB" in "tag input" element in browser view with selector "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']"
    And I wait for 0.2 seconds
    And I click on "add tag button" element in browser view with selector "div[data-tiddler-title^='Draft of'] span.tc-add-tag-button button"
    And I wait for 0.5 seconds
    And I click on "confirm button" element in browser view with selector "button:has(.tc-image-done-button)"
    And I wait for 3 seconds for "TiddlerC to be saved via tag tree routing"
    # Verify TiddlerC is saved to sub-wiki via tag tree (TiddlerB -> TiddlerA -> TagTreeRoot)
    # This confirms in-tagtree-of filter is working correctly
    Then file "TiddlerC.tid" should exist in "{tmpDir}/SubWikiTagTree"
    # Verify that TiddlerC is NOT in main wiki tiddlers folder
    Then file "TiddlerC.tid" should not exist in "{tmpDir}/wiki/tiddlers"

  @subwiki @subwiki-filter
  Scenario: Tiddlers matching custom filter are routed to sub-wiki
    # Setup: Create sub-wiki with custom filter that matches tiddlers with "FilterTest" field
    # The filter "[has[filtertest]]" will match any tiddler with a "filtertest" field
    Given I cleanup test wiki so it could create a new one on start
    And I setup a sub-wiki "SubWikiFilter" with tag "FilterTag" and filter "[has[filtertest]]" and tiddlers:
      | title          | tags      | content                        |
      | FilterTiddlerA | FilterTag | TiddlerA matched by filter     |
    # Now launch the app
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see "page body and workspaces" elements with selectors:
      | div[data-testid^='workspace-']:has-text('wiki')          |
      | div[data-testid^='workspace-']:has-text('SubWikiFilter') |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Create a tiddler with the "filtertest" field to test filter routing
    And I click on "add tiddler button" element in browser view with selector "button:has(.tc-image-new-button)"
    And I click on "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I wait for 0.2 seconds
    And I press "Control+a" in browser view
    And I wait for 0.2 seconds
    And I press "Delete" in browser view
    And I type "FilterMatchTiddler" in "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I wait for 0.5 seconds
    # Add the "filtertest" field by clicking on add field button
    And I click on "add field name input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-name-wrapper input"
    And I wait for 0.2 seconds
    And I type "filtertest" in "add field name input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-name-wrapper input"
    And I wait for 0.2 seconds
    And I click on "add field value input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-value input"
    And I wait for 0.2 seconds
    And I type "yes" in "add field value input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-value input"
    And I wait for 0.2 seconds
    And I click on "add field button" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add button"
    And I wait for 0.5 seconds
    # Confirm to save the tiddler
    And I click on "confirm button" element in browser view with selector "button:has(.tc-image-done-button)"
    And I wait for 3 seconds for "FilterMatchTiddler to be saved via filter routing"
    # Verify FilterMatchTiddler is saved to sub-wiki via filter
    Then file "FilterMatchTiddler.tid" should exist in "{tmpDir}/SubWikiFilter"
    # Verify that FilterMatchTiddler is NOT in main wiki tiddlers folder
    Then file "FilterMatchTiddler.tid" should not exist in "{tmpDir}/wiki/tiddlers"

  @subwiki @subwiki-settings-ui
  Scenario: Sub-wiki settings UI can enable includeTagTree option
    # This tests the EditWorkspace UI for setting includeTagTree via the new switch
    Given I cleanup test wiki so it could create a new one on start
    And I setup a sub-wiki "SubWikiSettings" with tag "SettingsTag" and tiddlers:
      | title           | tags        | content               |
      | SettingsTiddler | SettingsTag | Settings test tiddler |
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see "page body and workspaces" elements with selectors:
      | div[data-testid^='workspace-']:has-text('wiki')            |
      | div[data-testid^='workspace-']:has-text('SubWikiSettings') |
    # Open the edit workspace window using existing step
    When I open edit workspace window for workspace with name "SubWikiSettings"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    And I wait for 1 seconds for "page to fully render"
    # For sub-wikis, the accordion is defaultExpanded, so we should see the switch immediately
    Then I should see a "sub-workspace options accordion" element with selector "[data-testid='preference-section-subWorkspaceOptions']"
    # The includeTagTree switch should be visible for sub-wikis (accordion is already expanded)
    Then I should see a "includeTagTree switch" element with selector "[data-testid='include-tag-tree-switch']"
    # Enable includeTagTree option
    When I click on a "includeTagTree switch" element with selector "[data-testid='include-tag-tree-switch']"
    And I wait for 0.5 seconds
    # Save the changes by clicking the save button
    When I click on a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    And I wait for 0.5 seconds for "settings to be written"
    # Verify the setting was saved to settings.json
    Then settings.json should have workspace "SubWikiSettings" with "includeTagTree" set to "true"

  @subwiki @subwiki-create-ui
  Scenario: Create sub-wiki workspace via UI
    # This tests creating a sub-wiki through the Add Workspace UI
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Create sub-workspace via UI
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    # Toggle to sub-workspace mode by clicking the switch
    And I click on a "main/sub workspace switch" element with selector "[data-testid='main-sub-workspace-switch']"
    # Select the first (default) wiki workspace from dropdown
    And I select "wiki" from MUI Select with test id "main-wiki-select"
    # Type folder name
    And I type "SubWikiUI" in "sub wiki folder name input" element with selector "input[aria-describedby*='-helper-text'][value='wiki']"
    # Add tag using Autocomplete - type and press Enter to add the tag
    And I type "UITestTag" in "tag name input" element with selector "[data-testid='tagname-autocomplete-input']"
    And I press "Enter" key
    And I click on a "create sub workspace button" element with selector "button.MuiButton-colorSecondary"
    And I switch to "main" window
    Then I should see a "SubWikiUI workspace" element with selector "div[data-testid^='workspace-']:has-text('SubWikiUI')"
    # Wait for main wiki to restart after sub-wiki creation
    Then I wait for "main wiki restarted after sub-wiki creation" log marker "[test-id-MAIN_WIKI_RESTARTED_AFTER_SUBWIKI]"
    And I wait for "watch-fs stabilized after restart" log marker "[test-id-WATCH_FS_STABILIZED]"
    And I wait for "SSE ready after restart" log marker "[test-id-SSE_READY]"
    Then I wait for "view loaded" log marker "[test-id-VIEW_LOADED]"
    # Wait for TiddlyWiki to fully render the page (site title appears)
    Then I wait for "site title" element in browser view with selector "h1.tc-site-title"
    # Click SubWikiUI workspace to see the missing tag tiddler message
    When I click on a "SubWikiUI workspace button" element with selector "div[data-testid^='workspace-']:has-text('SubWikiUI')"
    # Verify UITestTag text is visible (missing tiddler message shows the title)
    Then I should see "UITestTag" in the browser view content
    # Verify the sub-wiki was created in settings.json
    Then settings.json should have workspace "SubWikiUI" with "tagNames" containing "UITestTag"
