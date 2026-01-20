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
    # Verify error message wrapper, internationalized title, and "Go to Settings" button are present
    Then I should see "error message wrapper and configuration issue title and go to settings button" elements with selectors:
      | element description       | selector                                                  |
      | error message wrapper     | [data-testid='error-message']                             |
      | configuration issue title | [data-testid='error-message']:has-text('配置问题')        |
      | go to settings button     | [data-testid='error-message'] button:has-text('前往设置') |
    # Verify we don't see the raw translation key
    Then I should not see a "raw error key text" element with selector "text='Chat.ConfigError.MissingConfigError'"
    # Click the button to open preferences
    When I click on a "go to settings button" element with selector "[data-testid='error-message'] button:has-text('前往设置')"
    # Switch to preferences window
    When I switch to "preferences" window
    # Verify preferences window opened to External Services section
    Then I should see an "external services section" element with selector "[data-testid='preference-section-externalAPI']"
