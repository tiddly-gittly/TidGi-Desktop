Feature: Nested tool work disclosure
  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"

  @toolDisclosure @mockOpenAI
  Scenario: Tool commands, consecutive calls, and completed work have independent disclosure
    Given I queue a two-step wiki search with a delayed final summary
    When I type "TOOL_DISCLOSURE_TEST search the wiki twice" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then live tool calls should be grouped while process commentary stays visible
    And completed tool work should support all three disclosure levels
    And tool work disclosure should remain accessible after reload
