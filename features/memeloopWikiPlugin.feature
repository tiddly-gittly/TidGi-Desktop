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
    Then I should see "shared chat surfaces and composers" elements in browser view with selectors:
      | element description | selector |
      | full chat | [data-testid='memeloop-wiki-agent-full'] [data-testid='memeloop-agent-chat'] |
      | full input | [data-testid='memeloop-wiki-agent-full'] [data-testid='agent-message-input'] |
      | full send | [data-testid='memeloop-wiki-agent-full'] [data-testid='agent-send-button'] |
      | sidebar chat | [data-testid='memeloop-wiki-agent-sidebar'] [data-testid='memeloop-agent-chat'] |
      | sidebar input | [data-testid='memeloop-wiki-agent-sidebar'] [data-testid='agent-message-input'] |
      | sidebar send | [data-testid='memeloop-wiki-agent-sidebar'] [data-testid='agent-send-button'] |
    And there should be 1 open agent conversations
    And the browser view element "[data-testid='memeloop-wiki-agent-sidebar'].memeloop-tw-chat--sidebar, [data-testid='memeloop-wiki-agent-sidebar'] .memeloop-tw-chat--sidebar" should be narrower than "[data-testid='memeloop-wiki-agent-full']" and at most 480 pixels wide
    And the browser view element "[data-testid='memeloop-wiki-agent-sidebar'] .memeloop-tw-chat__selectors" should have CSS property "flex-direction" equal to "column"

    When I drag tiddler "MemeLoop E2E Attachment" from ".memeloop-e2e-drag-source" to "[data-testid='memeloop-wiki-agent-full'] [data-testid='memeloop-agent-chat']" in browser view
    Then I should see a "full-view attachment" element in browser view with selector "[data-testid='memeloop-wiki-agent-full'] [data-testid='wiki-tiddler-chip-0']:has-text('MemeLoop E2E Attachment')"
    When I type "Send from full MemeLoop wiki view" in "full-view composer" element in browser view with selector "[data-testid='memeloop-wiki-agent-full'] [data-testid='agent-message-input']"
    And I click on "full-view send" element in browser view with selector "[data-testid='memeloop-wiki-agent-full'] [data-testid='agent-send-button']:not(:disabled)"
    Then I should see "first synchronized response" elements in browser view with selectors:
      | element description | selector |
      | full response | [data-testid='memeloop-wiki-agent-full'] [data-testid='message-bubble']:has-text('WIKI_SHARED_RESPONSE_ONE') |
      | sidebar response | [data-testid='memeloop-wiki-agent-sidebar'] [data-testid='message-bubble']:has-text('WIKI_SHARED_RESPONSE_ONE') |
    And there should be 2 elements in browser view matching "[data-testid='memeloop-wiki-agent-full'] [data-testid='message-bubble']"
    And there should be 2 elements in browser view matching "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='message-bubble']"
    And the last AI request user message should contain "MemeLoop E2E Attachment"
    And the last AI request user message should contain "MEMELOOP_REAL_TIDDLER_CONTENT_8f4d2b"

    When I drag tiddler "MemeLoop E2E Attachment" from ".memeloop-e2e-drag-source" to "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='memeloop-agent-chat']" in browser view
    Then I should see a "sidebar attachment" element in browser view with selector "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='wiki-tiddler-chip-0']:has-text('MemeLoop E2E Attachment')"
    When I type "Send from narrow MemeLoop sidebar" in "sidebar composer" element in browser view with selector "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='agent-message-input']"
    And I click on "sidebar send" element in browser view with selector "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='agent-send-button']:not(:disabled)"
    Then I should see "second synchronized response" elements in browser view with selectors:
      | element description | selector |
      | full response | [data-testid='memeloop-wiki-agent-full'] [data-testid='message-bubble']:has-text('WIKI_SHARED_RESPONSE_TWO') |
      | sidebar response | [data-testid='memeloop-wiki-agent-sidebar'] [data-testid='message-bubble']:has-text('WIKI_SHARED_RESPONSE_TWO') |
    And there should be 4 elements in browser view matching "[data-testid='memeloop-wiki-agent-full'] [data-testid='message-bubble']"
    And there should be 4 elements in browser view matching "[data-testid='memeloop-wiki-agent-sidebar'] [data-testid='message-bubble']"
    And the last AI request user message should contain "MemeLoop E2E Attachment"
    And the last AI request user message should contain "MEMELOOP_REAL_TIDDLER_CONTENT_8f4d2b"
