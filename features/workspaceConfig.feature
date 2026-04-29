Feature: Workspace Configuration Sync
  As a user
  I want workspace settings saved to tidgi.config.json
  So that settings persist when I remove and re-add a workspace

  Background:
    Given I cleanup test wiki so it could create a new one on start
    When I launch the TidGi application
    And I wait for the page to load completely

  @workspace-config
  Scenario: Workspace config is saved and restored via tidgi.config.json
    # Wait for default wiki to fully initialize (browser view loaded)
    And the browser view should be loaded and visible
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Step 1: Update workspace name via API (this triggers config file write)
    When I update workspace "wiki" settings:
      | property | value       |
      | name     | WikiRenamed |
    # Wait for config to be written to tidgi.config.json
    Then I wait for "config file written" log marker "[test-id-TIDGI_CONFIG_WRITTEN]"
    # Step 2: Verify tidgi.config.json was updated
    Then file "wiki/tidgi.config.json" should exist in "wiki-test"
    Then file "wiki/tidgi.config.json" should contain JSON with:
      | jsonPath | value       |
      | $.name   | WikiRenamed |
    # Step 3: Remove the workspace (keep files) via API
    When I remove workspace "WikiRenamed" keeping files
    # Step 4: Verify workspace is removed but config file still exists
    Then I should not see "wiki workspace in sidebar" elements with selectors:
      | element description      | selector                                               |
      | wiki workspace in sidebar| div[data-testid^='workspace-']:has-text('WikiRenamed') |
    Then file "wiki/tidgi.config.json" should exist in "wiki-test"
    # Step 5: Re-add the workspace by opening existing wiki
    # Clear previous log markers before waiting for new ones
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    When I click on a "open existing wiki tab" element with selector "button:has-text('导入本地知识库')"
    When I prepare to select directory in dialog "wiki-test/wiki"
    When I click on a "select folder button" element with selector "button:has-text('选择')"
    # Click the import button to actually add the workspace
    When I click on a "import wiki button" element with selector "button:has-text('导入知识库')"
    # Switch back to main window and wait for workspace to be created and loaded
    When I switch to "main" window
    Then I wait for log markers:
      | description           | marker                          |
      | workspace created     | [test-id-WORKSPACE_CREATED]     |
      | view loaded           | [test-id-VIEW_LOADED]           |
    # Step 6: Verify workspace is back with the saved name from tidgi.config.json
    Then I should see a "restored wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('WikiRenamed')"
    # Verify wiki is actually loaded and functional
    And the browser view should be loaded and visible

  @no-tidgi-config
  Scenario: Import wiki without tidgi.config.json keeps config local and isolated
    # Wait for default wiki to fully initialize
    And the browser view should be loaded and visible
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"

    # Step 1: Rename the first workspace to establish a synced config in tidgi.config.json
    When I update workspace "wiki" settings:
      | property | value      |
      | name     | SyncedWiki |
    Then I wait for "config file written" log marker "[test-id-TIDGI_CONFIG_WRITTEN]"
    Then file "wiki/tidgi.config.json" should exist in "wiki-test"
    Then file "wiki/tidgi.config.json" should contain JSON with:
      | jsonPath | value      |
      | $.name   | SyncedWiki |

    # Step 2: Import the same wiki folder WITHOUT using tidgi.config.json
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    When I click on a "open existing wiki tab" element with selector "button:has-text('导入本地知识库')"
    When I prepare to select directory in dialog "wiki-test/wiki"
    When I click on a "select folder button" element with selector "button:has-text('选择')"
    # Uncheck the "Use tidgi.config" checkbox to create a local-only workspace
    When I click on a "use tidgi config checkbox" element with selector "[data-testid='use-tidgi-config-checkbox']"
    Then the "use tidgi config checkbox" element with selector "[data-testid='use-tidgi-config-checkbox']" should be unchecked
    When I click on a "import wiki button" element with selector "button:has-text('导入知识库')"
    When I switch to "main" window
    Then I wait for log markers:
      | description       | marker                      |
      | workspace created | [test-id-WORKSPACE_CREATED] |
      | view loaded       | [test-id-VIEW_LOADED]       |
    # The second workspace uses the folder name by default since it doesn't read tidgi.config.json
    Then I should see a "second wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"

    # Step 3: Rename the second (local-only) workspace
    When I update workspace "wiki" settings:
      | property | value      |
      | name     | LocalWiki  |

    # Step 4: Verify tidgi.config.json was NOT overwritten by the local-only workspace
    Then file "wiki/tidgi.config.json" should contain JSON with:
      | jsonPath | value      |
      | $.name   | SyncedWiki |

    # Step 5: Verify settings.json stores full config for the local-only workspace
    Then settings.json should have workspace "LocalWiki" with "useTidgiConfigSync" set to "false"

    # Step 6: Set read-only mode on the local-only workspace (simulating blog deployment setup)
    When I update workspace "LocalWiki" settings:
      | property     | value |
      | readOnlyMode | true  |

    # Step 7: Verify read-only config did NOT leak into tidgi.config.json
    Then file "wiki/tidgi.config.json" should contain JSON with:
      | jsonPath | value      |
      | $.name   | SyncedWiki |
    # Verify tidgi.config.json does NOT contain readOnlyMode
    Then file "wiki/tidgi.config.json" should not contain JSON with:
      | jsonPath     | value |
      | $.readOnlyMode | true  |

    # Step 8: Verify both workspaces are visible in the sidebar
    Then I should see a "synced wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('SyncedWiki')"
    Then I should see a "local wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('LocalWiki')"

  @no-tidgi-config-restart
  Scenario: Non-synced workspace config survives restart
    # Wait for default wiki to fully initialize
    And the browser view should be loaded and visible
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"

    # Pre-rename default workspace to avoid name collision with imported workspace
    When I update workspace "wiki" settings:
      | property | value       |
      | name     | DefaultWiki |

    # Step 1: Import wiki folder without using tidgi.config.json
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    When I click on an "add workspace button" element with selector "#add-workspace-button"
    And I switch to "addWorkspace" window
    And I wait for the page to load completely
    When I click on a "open existing wiki tab" element with selector "button:has-text('导入本地知识库')"
    When I prepare to select directory in dialog "wiki-test/wiki"
    When I click on a "select folder button" element with selector "button:has-text('选择')"
    # Uncheck the "Use tidgi.config" checkbox
    When I click on a "use tidgi config checkbox" element with selector "[data-testid='use-tidgi-config-checkbox']"
    Then the "use tidgi config checkbox" element with selector "[data-testid='use-tidgi-config-checkbox']" should be unchecked
    When I click on a "import wiki button" element with selector "button:has-text('导入知识库')"
    When I switch to "main" window
    Then I wait for log markers:
      | description       | marker                      |
      | workspace created | [test-id-WORKSPACE_CREATED] |
      | view loaded       | [test-id-VIEW_LOADED]       |

    # Step 2: Rename and configure the non-synced workspace for blog deployment
    When I update workspace "wiki" settings:
      | property     | value      |
      | name         | BlogDeploy |
      | readOnlyMode | true       |

    # Step 3: Verify tidgi.config.json does NOT contain the readOnlyMode from the non-synced workspace
    # (Default wiki may have created tidgi.config.json, but the non-synced workspace must not modify it)
    Then file "wiki/tidgi.config.json" should not contain JSON with:
      | jsonPath       | value |
      | $.readOnlyMode | true  |

    # Step 4: Restart the application
    When I close the TidGi application
    And I clear log lines containing "[test-id-WORKSPACE_CREATED]"
    And I clear log lines containing "[test-id-VIEW_LOADED]"
    When I launch the TidGi application
    And I wait for the page to load completely
    And the browser view should be loaded and visible

    # Step 5: Verify the non-synced workspace survived restart with its config intact
    Then I should see a "blog deploy workspace" element with selector "div[data-testid^='workspace-']:has-text('BlogDeploy')"
    Then settings.json should have workspace "BlogDeploy" with "readOnlyMode" set to "true"
    Then settings.json should have workspace "BlogDeploy" with "useTidgiConfigSync" set to "false"
