Feature: MemeLoop shared Agent UI inside a packaged TiddlyWiki renderer
  As a TidGi user
  I want the same MemeLoop conversation in a wiki tiddler and the narrow sidebar
  So that I can attach real tiddlers and keep working from either entry point

  @memeloop-wiki-plugin @mockOpenAI
  Scenario: Main view and narrow sidebar share a real tiddler attachment conversation
    Given I add test ai settings
    And I have started the mock OpenAI server
      | response                 | stream |
      | WIKI_SHARED_RESPONSE_ONE | false  |
      | WIKI_SHARED_RESPONSE_TWO | false  |
    Then I launch the TidGi application
    And I wait for the page to load completely
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler({title:'MemeLoop E2E Attachment',text:'This is a real persisted TiddlyWiki tiddler. MEMELOOP_REAL_TIDDLER_CONTENT_8f4d2b',type:'text/vnd.tiddlywiki'}); $tw.wiki.addTiddler({title:'MemeLoop E2E Drag Source',text:'<$draggable tiddler=\"MemeLoop E2E Attachment\" class=\"memeloop-e2e-drag-source\">Drag real tiddler</$draggable>',type:'text/vnd.tiddlywiki'});"
    And I open tiddler "MemeLoop E2E Drag Source" in browser view
    And I open tiddler "MemeLoop Agent" in browser view
    And I click on "MemeLoop sidebar tab" element in browser view with selector ".tc-sidebar-lists .tc-tab-buttons button:has-text('MemeLoop')"
    Then both MemeLoop wiki entries should use the shared chat UI and the sidebar should be narrow

    When I drag the real wiki tiddler into the "full" MemeLoop wiki entry
    Then I should see a "full-view attachment" element in browser view with selector "[data-testid='memeloop-wiki-agent-full'] [data-testid='wiki-tiddler-chip-0']:has-text('MemeLoop E2E Attachment')"
    When I type "Send from full MemeLoop wiki view" in "full-view composer" element in browser view with selector "[data-testid='memeloop-wiki-agent-full'] [data-testid='agent-message-input']"
    And I click on "full-view send" element in browser view with selector "[data-testid='memeloop-wiki-agent-full'] [data-testid='agent-send-button']:not(:disabled)"
    Then both MemeLoop wiki entries should show 2 synchronized messages containing "WIKI_SHARED_RESPONSE_ONE"

    When I drag the real wiki tiddler into the "sidebar" MemeLoop wiki entry
    Then I should see a "sidebar attachment" element in browser view with selector "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='wiki-tiddler-chip-0']:has-text('MemeLoop E2E Attachment')"
    When I type "Send from narrow MemeLoop sidebar" in "sidebar composer" element in browser view with selector "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='agent-message-input']"
    And I click on "sidebar send" element in browser view with selector "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='agent-send-button']:not(:disabled)"
    Then both MemeLoop wiki entries should show 4 synchronized messages containing "WIKI_SHARED_RESPONSE_TWO"
    And both wiki attachment requests should contain the real tiddler content
