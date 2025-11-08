@hibernation
Feature: Workspace Hibernation
  As a user
  I want to be able to hibernate workspaces
  So that I can save system resources when workspaces are not in use

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Create a second wiki workspace programmatically for hibernation testing
    When I create a new wiki workspace with name "wiki2"
    And I wait for 1 seconds for "wiki2 workspace icon to appear"
    Then I should see a "wiki2 workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki2')"

  Scenario: Hibernate both workspaces and verify switching with wake up (issues #556 and #593)
    # Enable hibernation for both wiki workspaces
    # Enable for wiki
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on "misc options accordion and hibernation switch" elements with selectors:
      | [data-testid='preference-section-miscOptions']     |
      | [data-testid='hibernate-when-unused-switch']       |
    When I click on a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I switch to "main" window
    When I close "editWorkspace" window
    # Enable hibernation for wiki2
    When I open edit workspace window for workspace with name "wiki2"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on "misc options accordion and hibernation switch" elements with selectors:
      | [data-testid='preference-section-miscOptions']     |
      | [data-testid='hibernate-when-unused-switch']       |
    When I click on a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I switch to "main" window
    When I close "editWorkspace" window
    # Start with wiki, create a test tiddler to verify workspace content
    When I click on a "wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    # Create a test tiddler in wiki workspace
    And I click on "add tiddler button" element in browser view with selector "button:has(.tc-image-new-button)"
    And I click on "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I wait for 0.2 seconds
    And I press "Control+a" in browser view
    And I wait for 0.2 seconds
    And I press "Delete" in browser view
    And I type "WikiTestTiddler" in "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    # Confirm to save the tiddler
    And I click on "confirm button" element in browser view with selector "button:has(.tc-image-done-button)"
    And I wait for 0.2 seconds
    Then I should see a "WikiTestTiddler tiddler" element in browser view with selector "div[data-tiddler-title='WikiTestTiddler']"
    # Switch to wiki2 - wiki should hibernate, wiki2 should load
    When I click on a "wiki2 workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki2')"
    Then the browser view should be loaded and visible
    # Verify wiki workspace is now hibernated (icon should be grayed out)
    Then I should see a "wiki workspace hibernated icon" element with selector "div[data-testid^='workspace-']:has-text('wiki')[data-hibernated='true']"
    # Verify we're in wiki2 by checking Index tiddler (default open) - not WikiTestTiddler
    Then I should see a "Index tiddler" element in browser view with selector "div[data-tiddler-title='Index']"
    Then I should not see a "WikiTestTiddler tiddler" element in browser view with selector "div[data-tiddler-title='WikiTestTiddler']"
    # Switch back to wiki - wiki2 should hibernate, wiki should wake up (reproduces issue #556)
    # This also tests issue #593 - browser view should persist after wake up
    When I click on a "wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    # Verify wiki2 workspace is now hibernated
    Then I should see a "wiki2 workspace hibernated icon" element with selector "div[data-testid^='workspace-']:has-text('wiki2')[data-hibernated='true']"
    # Verify wiki workspace is no longer hibernated
    Then I should see a "wiki workspace active icon" element with selector "div[data-testid^='workspace-']:has-text('wiki')[data-hibernated='false'][data-active='true']"
    # Verify WikiTestTiddler is still there after wake up
    Then I should see a "WikiTestTiddler tiddler" element in browser view with selector "div[data-tiddler-title='WikiTestTiddler']"
