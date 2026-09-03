@agent @long-conversation @ai-setting @calibrate
Feature: Bounded long-conversation renderer
  As a user with a conversation much longer than renderer memory
  I want timeline navigation and prompt inspection to remain bounded and complete
  So that repeated context compaction never makes the desktop UI stall or forget recent history

  Scenario: Packaged renderer pages, seeks and previews a repeatedly compacted conversation
    Given I add test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    And I click on an "agent suggestion" element with selector "[data-autocomplete-source-id='agentsSource'] [data-agent-definition-id='memeloop:general-assistant']"
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"

    When I seed the active packaged agent with 2048 long-conversation turns and repeated compactions
    Then the long-conversation renderer should keep its initial DOM bounded at 50 messages and 50 timeline markers
    And hovering the latest timeline marker should show the latest user and assistant previews

    When I load one earlier resident message page
    Then the resident message window should move earlier while remaining bounded at 50 messages

    When I seek the conversation timeline to its first absolute entry
    Then the first long-conversation turn should be rendered in a bounded resident window

    When I open the generated model-request prompt audit
    Then the generated prompt should contain all repeated compaction summaries and the recent conversation tail
