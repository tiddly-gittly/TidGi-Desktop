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
    When I open the packaged MemeLoop wiki main view and sidebar with a real draggable tiddler
    Then both MemeLoop wiki entries should use the shared chat UI and the sidebar should be narrow

    When I drag the real wiki tiddler into the "full" MemeLoop wiki entry
    Then the "full" MemeLoop wiki entry should show the dropped tiddler attachment
    When I send "Send from full MemeLoop wiki view" from the "full" MemeLoop wiki entry
    Then both MemeLoop wiki entries should show 2 synchronized messages containing "WIKI_SHARED_RESPONSE_ONE"

    When I drag the real wiki tiddler into the "sidebar" MemeLoop wiki entry
    Then the "sidebar" MemeLoop wiki entry should show the dropped tiddler attachment
    When I send "Send from narrow MemeLoop sidebar" from the "sidebar" MemeLoop wiki entry
    Then both MemeLoop wiki entries should show 4 synchronized messages containing "WIKI_SHARED_RESPONSE_TWO"
    And both wiki attachment requests should contain the real tiddler content
