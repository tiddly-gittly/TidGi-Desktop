Feature: Tiddler Creation and Editing
  As a user
  I want to create and edit tiddlers in the wiki
  So that I can manage my content

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for "SSE backend ready" log marker "[test-id-SSE_READY]"

  @tiddler @tiddler-create
  Scenario: Create a new tiddler with tag and custom field via UI
    # These are micro steps of `When I create a tiddler "MyTestTiddler" with field "customfield" set to "customvalue" in browser view` and `When I create a tiddler "MyTestTiddler" with tag "MyTestTag" in browser view`
    # Click add tiddler button
    And I click on "add tiddler button" element in browser view with selector "button:has(.tc-image-new-button)"
    # Focus on title input, clear it, and type new title
    And I click on "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    And I press "Control+a" in browser view
    And I press "Delete" in browser view
    And I type "MyTestTiddler" in "title input" element in browser view with selector "div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor"
    # Add a tag
    And I click on "tag input" element in browser view with selector "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']"
    And I type "MyTestTag" in "tag input" element in browser view with selector "div[data-tiddler-title^='Draft of'] div.tc-edit-add-tag-ui input.tc-edit-texteditor[placeholder='标签名称']"
    And I click on "add tag button" element in browser view with selector "div[data-tiddler-title^='Draft of'] span.tc-add-tag-button button"
    # Add a custom field
    And I click on "add field name input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-name-wrapper input"
    And I type "customfield" in "add field name input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-name-wrapper input"
    And I click on "add field value input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-value input"
    And I type "customvalue" in "add field value input" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add-value input"
    And I click on "add field button" element in browser view with selector "div[data-tiddler-title^='Draft of'] .tc-edit-field-add button"
    # Confirm to save the tiddler
    And I click on "confirm button" element in browser view with selector "button:has(.tc-image-done-button)"
    # Verify the tiddler was created and is visible
    Then I should see a "MyTestTiddler tiddler" element in browser view with selector "div[data-tiddler-title='MyTestTiddler']"
    # Verify the tag was added
    Then I should see a "MyTestTag tag" element in browser view with selector "[data-tiddler-title='MyTestTiddler'] [data-tag-title='MyTestTag']"
    # Verify the tiddler file was created
    Then file "MyTestTiddler.tid" should exist in "{tmpDir}/wiki/tiddlers"
