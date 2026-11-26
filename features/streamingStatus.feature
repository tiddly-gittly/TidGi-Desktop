Feature: Message Streaming Status
  As a user
  I want the send button to return to normal state after AI completes
  So that I can send multiple messages consecutively

  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Navigate to agent workspace
    And I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |

  @agent @mockOpenAI @streamingStatus
  Scenario: Send button returns to normal state after AI response completes
    # Add mock response
    Given I add mock OpenAI responses:
      | response      | stream |
      | First reply   | false  |
      | Second reply  | false  |
      | Third reply   | false  |
    
    # Open agent chat
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    
    # Send first message
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "First message" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    
    # Verify send button is in normal state (not streaming)
    # The send icon should be visible and cancel icon should not be visible
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
    
    # Send second message to confirm button works
    When I type "Second message" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    
    # Verify send button is still in normal state
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
    
    # Send third message to triple confirm
    When I type "Third message" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 6 messages in chat history
    
    # Final verification
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
    When I click on a "third turn" element with selector "[data-testid='conversation-timeline'] [aria-posinset='3']"
    Then I should see a "selected third turn" element with selector "[data-testid='conversation-timeline'] [aria-posinset='3'][aria-current='location']"
    And the element with selector "[data-memeloop-turn-anchor='true']:focus" should lie inside viewport "[data-testid='conversation-viewport']"
    And I should see "Third message" text in "[data-memeloop-turn-anchor='true']:focus" or its frames

  @agent @mockOpenAI @markdownStreaming
  Scenario: A Markdown table stays rendered while rows arrive
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on an "agent settings section" element with selector "[data-testid='preference-section-aiAgent']"
    Then I should see a "default WikiText format" element with selector "select[aria-label='对话渲染格式']:has(option[value='wikitext']:checked)"
    When I focus on a "message format" element with selector "select[aria-label='对话渲染格式']"
    And I press "ArrowDown" key
    And I press "Enter" key
    Then I should see a "Markdown format" element with selector "select[aria-label='对话渲染格式']:has(option[value='markdown']:checked)"
    When I close "preferences" window
    And I switch to "main" window
    Given I add mock OpenAI responses:
      | responseFile                      | stream |
      | chat-streaming-markdown-table.txt | true   |
    When I type "Show the review table" in "chat input" element with selector "[data-testid='agent-message-input']"
    Then there should be between 1 and 1 elements matching "button[data-testid='agent-send-button']:has([data-testid='send-icon'])" with distinct "data-testid" attributes
    When I press "Enter" key
    Then I should see a "streaming table header" element with selector "[data-testid='assistant-streaming-text'] table th:text-is('Task')"
    And there should be between 1 and 1 elements matching "button[data-testid='agent-send-button']" with distinct "data-testid" attributes
    And I should see a "stop action" element with selector "button[data-testid='agent-send-button'] [data-testid='cancel-icon']"
    And I should see a "new rendered row" element with selector "[data-testid='assistant-streaming-text'] table td:text-is('Write summary')"
    And I should see a "finished Markdown table" element with selector "[data-testid='assistant-message'] table td strong:text-is('Ready')"
    And I should see a "restored send action" element with selector "button[data-testid='agent-send-button'] [data-testid='send-icon']"
    And there should be between 1 and 1 elements matching "button[data-testid='agent-send-button']" with distinct "data-testid" attributes

  @agent @mockOpenAI @wikitextStreaming
  Scenario: WikiText tables stay rendered as new rows and macro calls arrive
    Given I add mock OpenAI responses:
      | responseFile             | stream |
      | chat-streaming-table.tid | true   |
    When I click on a "conversation workspace" element with selector "[data-testid='conversation-workspace-select'] [role='combobox']"
    And I click on a "wiki option" element with selector "[role='option']:text-is('wiki')"
    And I type "Show the WikiText review table" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "streaming table header" element with selector "table th:text-is('Task')" in frame "[data-testid='assistant-streaming-text'] iframe[data-testid='rendered-message']"
    And I should see a "streaming macro expansion" element with selector "table td strong:text-is('Ready')" in frame "[data-testid='assistant-streaming-text'] iframe[data-testid='rendered-message']"
    And I should see a "finished added row" element with selector "table td:text-is('Write summary')" in frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']"
    And I should see a "restored send action" element with selector "button[data-testid='agent-send-button'] [data-testid='send-icon']"
    And I should see a "finished macro expansion" element with selector "table td strong:text-is('Ready')" in frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']"
