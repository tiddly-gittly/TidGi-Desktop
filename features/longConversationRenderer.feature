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
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"

    When I seed the active packaged agent with 2048 long-conversation turns and repeated compactions
    Then I should see a "recent answer" element with selector "[data-testid='conversation-viewport']:has-text('E2E long answer 02047')"
    And there should be between 1 and 50 elements matching "[data-testid='message-bubble']" with distinct "data-memeloop-message-id" attributes
    And there should be between 1 and 50 elements matching "[data-testid='conversation-timeline'] [data-timeline-entry-index]" with distinct "data-timeline-entry-index" attributes
    And I should see a "complete turn count" element with selector "[data-testid='conversation-timeline'] [aria-setsize='2048']"
    When I remember the text and "data-memeloop-message-id" attribute of elements with selector "[data-testid='message-bubble'] >> nth=0" as "initial resident boundary"
    And I hover on a "latest user timeline marker" element with selector "[data-timeline-entry-index='4097']"
    Then I should see a "latest question preview" element with selector "[role='tooltip']:has-text('E2E long question 02047')"
    And I should not see a "second marker for the same turn" element with selector "[data-timeline-entry-index='4098']"

    When I click on an "earlier messages" element with selector "[data-testid='conversation-viewport'] > button >> nth=0"
    Then the text and "data-memeloop-message-id" attribute of elements with selector "[data-testid='message-bubble'] >> nth=0" should not match "initial resident boundary"
    And there should be between 1 and 50 elements matching "[data-testid='message-bubble']" with distinct "data-memeloop-message-id" attributes

    When I scroll a "conversation timeline" element with selector "[data-testid='conversation-timeline']" to the top
    Then I should see a "first absolute timeline marker" element with selector "[data-timeline-entry-index='0'][aria-posinset='1']"
    When I click on a "first absolute timeline marker" element with selector "[data-timeline-entry-index='0']"
    Then I should see a "first durable question" element with selector "[data-testid='conversation-viewport']:has-text('E2E long question 00000')"
    And I should see a "selected first timeline marker" element with selector "[data-timeline-entry-index='0'][aria-current='location']"
    And I should see a "first durable message identity" element with selector "[data-testid='message-bubble'][data-memeloop-message-id$=':00000']"
    And I should see a "focused question at the selected turn" element with selector "[data-memeloop-turn-anchor='true'][data-memeloop-message-id$=':00000']:focus"
    And the element with selector "[data-memeloop-turn-anchor='true'][data-memeloop-message-id$=':00000']" should lie inside viewport "[data-testid='conversation-viewport']"
    And there should be between 1 and 50 elements matching "[data-testid='message-bubble']" with distinct "data-memeloop-message-id" attributes

    When I click on a "prompt preview" element with selector "[data-testid='prompt-preview-button']"
    And I switch to "promptPreview" window
    Then I should see a "prompt inspector" element with selector "[data-testid='prompt-execution-inspector']"
    When I click on a "message list tab" element with selector "[role='dialog'] [role='tab'] >> nth=1"
    Then I should see a "model request audit" element with selector "[data-testid='prompt-preview-execution-audit']"
    When I click on a "complete model request" element with selector "[data-testid='prompt-preview-model-request-detail']"
    Then the paginated JSON in "[data-testid='prompt-preview-audit-detail'] pre" with next button "[data-testid='prompt-preview-audit-detail-next']" should contain these texts and exclude "Schema.WikiSearch.":
      | E2E durable compaction summary 1 |
      | E2E durable compaction summary 2 |
      | E2E durable compaction summary 3 |
      | E2E long question 02047 |
      | E2E long answer 02047 |
