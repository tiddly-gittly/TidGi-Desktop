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
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
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

  @agent @mockOpenAI @streamingStatus @imageUpload
  Scenario: Image upload streaming status and history verification
    # Add mock responses
    Given I add mock OpenAI responses:
      | response                      | stream |
      | Received image and text       | false  |
      | Received second message       | false  |
    
    Given I am on the agent chat page
    
    # Upload image with first message
    When I attach the image "template/wiki/files/TiddlyWikiIconBlack.png"
    Then I should see a preview of the image above the input box
    
    # Send message with image
    When I type "Describe this image" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should see the image in the chat history
    
    # Verify send button returned to normal after first message
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
    
    # Verify agent received the image
    Then the agent should receive the image
    
    # Send second message to check history includes image
    When I type "Continue" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    
    # Verify send button is still normal after second message
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
    
    # Verify agent received history including the image from first message
    Then the agent should receive the image
