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
    And the element with selector "[data-memeloop-turn-anchor='true']:focus:has-text('Third message')" should lie inside viewport "[data-testid='conversation-viewport']"

  @agent @mockOpenAI @markdownStreaming
  Scenario: A Markdown table stays rendered while rows arrive
    Given I add mock OpenAI responses:
      | responseFile            | stream |
      | chat-streaming-table.md | true   |
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
