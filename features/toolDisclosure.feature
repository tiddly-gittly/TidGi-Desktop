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
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"

  @toolDisclosure @mockOpenAI
  Scenario Outline: Tool commands, consecutive calls, and completed work have independent disclosure
    When I use the "<theme>" application theme
    Given I add mock OpenAI responses:
      | response | stream | toolName | toolArguments | delayMs |
      | PROCESS_GOAL: I will inspect two wiki entries. | false | wiki-search | {"workspaceName":"wiki","filter":"[title[Index]]"} | |
      | | false | wiki-search | {"workspaceName":"wiki","filter":"[title[GettingStarted]]"} | |
      | FINAL_TOOL_SUMMARY: Both searches are complete. This conclusion stays visible. | false | | | 6000 |
    When I type "TOOL_DISCLOSURE_TEST search the wiki twice" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "collapsed live tool group" element with selector "[data-testid='tool-group-disclosure']:not([open])"
    And I should not see a "completed work wrapper" element with selector "[data-testid='work-disclosure']"
    And I should see a "running assistant" element with selector "[data-testid='assistant-run-status']"
    And I should see "PROCESS_GOAL" text in "[data-testid='message-bubble']" or its frames
    And I capture the current window as "tools-<theme>-live.png"
    And I should not see a "running assistant" element with selector "[data-testid='assistant-run-status']"
    And I should see a "collapsed completed work" element with selector "[data-testid='work-disclosure']:not([open]) > summary:has-text('2')"
    And I capture the current window as "tools-<theme>-completed.png"
    When I click on a "completed work summary" element with selector "[data-testid='work-disclosure'] > summary"
    Then I should see a "collapsed tool group" element with selector "[data-testid='work-disclosure'] [data-testid='tool-group-disclosure']:not([open])"
    When I click on a "tool group summary" element with selector "[data-testid='tool-group-disclosure'] > summary"
    Then I should see a "second tool command" element with selector "[data-testid='tool-group-disclosure'] [data-testid='tool-disclosure'] >> nth=1"
    When I click on a "first search command" element with selector "[data-testid='tool-disclosure']:has-text('\"filter\":\"[title[Index]]\"') > summary >> nth=0"
    Then I should see an "expanded first search command" element with selector "[data-testid='tool-disclosure'][open] pre:has-text('\"filter\":\"[title[Index]]\"')"
    When I hover on a "search command source" element with selector "[data-testid='tool-disclosure'][open] pre:has-text('\"filter\":\"[title[Index]]\"')"
    And I capture the current window as "tools-<theme>-expanded.png"
    And I click on "collapse command, group and work" elements with selectors:
      | element description | selector |
      | command | [data-testid='tool-disclosure'][open] > summary |
      | group | [data-testid='tool-group-disclosure'] > summary |
      | work | [data-testid='work-disclosure'] > summary |
    Then I should see "FINAL_TOOL_SUMMARY" text in "[data-testid='assistant-message']" or its frames
    When I reload the current window
    Then I should see a "restored collapsed work" element with selector "[data-testid='work-disclosure']:not([open])"
    When I focus on a "completed work summary" element with selector "[data-testid='work-disclosure'] > summary"
    And I press "Enter" key
    Then I should see a "keyboard expanded work" element with selector "[data-testid='work-disclosure'][open]"
    When I click on a "tool group summary" element with selector "[data-testid='tool-group-disclosure'] > summary"
    Then I should see a "second restored tool command" element with selector "[data-testid='tool-group-disclosure'] [data-testid='tool-disclosure'] >> nth=1"
    When I click on a "collapse completed work" element with selector "[data-testid='work-disclosure'] > summary"
    And I click on a "tool timeline marker" element with selector "[data-timeline-message-id]" whose "data-timeline-message-id" matches the "data-memeloop-message-id" of "[data-testid='tool-group-disclosure'] [data-testid='message-bubble']:has([data-testid='assistant-message'])"
    Then I should see "revealed disclosure levels" elements with selectors:
      | element description | selector |
      | work | [data-testid='work-disclosure'][open] |
      | group | [data-testid='tool-group-disclosure'][open] |
      | command | [data-testid='tool-group-disclosure'] [data-testid='message-bubble']:focus [data-testid='tool-disclosure'][open] |
    And the element with selector "[data-testid='tool-group-disclosure'] [data-testid='message-bubble']:focus" should lie inside viewport "[data-testid='conversation-viewport']"
    And I capture the current window as "tools-<theme>-timeline-reveal.png"

    Examples:
      | theme |
      | light |
      | dark |
