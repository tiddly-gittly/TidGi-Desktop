Feature: Configuration Error Handling
  As a user
  When AI configuration is missing or invalid
  I want to see clear error messages with actionable buttons
  So that I can easily fix configuration issues

  Background:
    Given I remove test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @config-error-button
  Scenario: Configuration error message shows internationalized text and "Go to Settings" button
    # This scenario tests error message display without AI configuration
    # Ensure we are in the agent workspace
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    # Create a default agent (this should work without AI config)
    When I click on "new tab button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | new tab button              | [data-tab-id='new-tab-button']              |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Try to send a message - this should fail with MissingConfigError
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "Hello" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    # Wait for error propagation through the async agent framework
    And I wait for 5 seconds for "error message to render"
    # The memeloop framework creates an error chat message in the conversation
    Then I should see 2 messages in chat history
    # Verify we don't see the raw translation key leaked into the UI
    Then I should not see a "raw error key text" element with selector "text='Chat.ConfigError.MissingConfigError'"
