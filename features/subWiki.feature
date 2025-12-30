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
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Create tiddler with tag to test routing to sub-wiki folder
    When I create a tiddler "TestTiddlerTitle" with tag "TestTag" in browser view
    And I wait for 3 seconds for "tiddler to be saved and routed to sub-wiki"
    # Verify the tiddler file exists in sub-wiki folder after save
    Then file "TestTiddlerTitle.tid" should exist in "{tmpDir}/SubWiki"
    # Verify tiddler is NOT in main wiki tiddlers folder
    Then file "TestTiddlerTitle.tid" should not exist in "{tmpDir}/wiki/tiddlers"
    # Test SSE is still working - modify a main wiki tiddler
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to contain "Main wiki content modified after SubWiki creation"
    Then I wait for tiddler "Index" to be updated by watch-fs
    Then I should see a "Index tiddler" element in browser view with selector "div[data-tiddler-title='Index']"
    Then I should see "Main wiki content modified after SubWiki creation" in the browser view content
    # Test modification in sub-wiki folder
    When I modify file "{tmpDir}/SubWiki/TestTiddlerTitle.tid" to contain "Content modified in SubWiki folder"
    And I wait for 2 seconds for "watch-fs to detect file change in sub-wiki"
    When I open tiddler "TestTiddlerTitle" in browser view
    And I wait for 1 seconds
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
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
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
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
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
    # Create TiddlerC with tag TiddlerB (testing tag tree routing: TiddlerC -> TiddlerB -> TiddlerA -> TagTreeRoot)
    When I create a tiddler "TiddlerC" with tag "TiddlerB" in browser view
    And I wait for 3 seconds for "TiddlerC to be saved via tag tree routing"
    # Verify TiddlerC is saved to sub-wiki via tag tree (TiddlerB -> TiddlerA -> TagTreeRoot)
    Then file "TiddlerC.tid" should exist in "{tmpDir}/SubWikiTagTree"
    Then file "TiddlerC.tid" should not exist in "{tmpDir}/wiki/tiddlers"

  @subwiki @subwiki-filter
  Scenario: Tiddlers matching custom filter are routed to sub-wiki
    # Setup: Create sub-wiki with custom filter that matches tiddlers with "filtertest" field
    Given I cleanup test wiki so it could create a new one on start
    And I setup a sub-wiki "SubWikiFilter" with tag "FilterTag" and filter "[has[filtertest]]" and tiddlers:
      | title          | tags      | content                        |
      | FilterTiddlerA | FilterTag | TiddlerA matched by filter     |
    When I launch the TidGi application
    And I wait for the page to load completely
    Then I should see "page body and workspaces" elements with selectors:
      | div[data-testid^='workspace-']:has-text('wiki')          |
      | div[data-testid^='workspace-']:has-text('SubWikiFilter') |
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    # Create a tiddler with the "filtertest" field to test filter routing
    When I create a tiddler "FilterMatchTiddler" with field "filtertest" set to "yes" in browser view
    And I wait for 3 seconds for "FilterMatchTiddler to be saved via filter routing"
    # Verify FilterMatchTiddler is saved to sub-wiki via filter
    Then file "FilterMatchTiddler.tid" should exist in "{tmpDir}/SubWikiFilter"
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
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
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
