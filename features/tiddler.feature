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
    # Click add tiddler button and focus title input
    And I click on "add tiddler button and title input" elements in browser view with selectors:
      | element description | selector                                                                 |
      | add tiddler button  | button:has(.tc-image-new-button)                                         |
      | title input         | div[data-tiddler-title^='Draft of'] input.tc-titlebar.tc-edit-texteditor |
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
    And I click on "add field button and confirm button" elements in browser view with selectors:
      | element description | selector                                                       |
      | add field button    | div[data-tiddler-title^='Draft of'] .tc-edit-field-add button   |
      | confirm button      | button:has(.tc-image-done-button)                              |
    # Verify the tiddler and tag were created
    Then I should see "MyTestTiddler tiddler and MyTestTag tag" elements in browser view with selectors:
      | element description | selector                                                         |
      | MyTestTiddler tiddler | div[data-tiddler-title='MyTestTiddler']                         |
      | MyTestTag tag         | [data-tiddler-title='MyTestTiddler'] [data-tag-title='MyTestTag'] |
    # Verify the tiddler file was created
    Then file "MyTestTiddler.tid" should exist in "{tmpDir}/wiki/tiddlers"
