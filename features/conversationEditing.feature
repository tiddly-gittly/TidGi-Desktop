Feature: Shared conversation editing, status and wiki rendering
  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    When I click on an "agent workspace" element with selector "[data-testid='workspace-agent']"
    And I click on "new tab and default agent" elements with selectors:
      | element description | selector |
      | new tab | [data-tab-id='new-tab-button'] |
      | default agent | [data-testid='create-default-agent-button'] |
    Then I should see a "message input" element with selector "[data-testid='agent-message-input']"

  @agent @mockOpenAI @conversationEditing
  Scenario: Drafts survive reload and branches preserve both continuations
    Given I add mock OpenAI responses:
      | response | stream |
      | ORIGINAL_REPLY | false |
      | ORIGINAL_LATER_REPLY | false |
      | EDITED_BRANCH_REPLY | false |
    When I type "ORIGINAL_QUESTION" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    When I type "ORIGINAL_LATER_QUESTION" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    When I hover the first user message
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    And I type "AUTOSAVED_DRAFT" in "message edit" element with selector "[data-testid='message-edit-input']"
    Then the conversation edit draft should be persisted as "AUTOSAVED_DRAFT"
    When I reload the conversation window
    And I hover the first user message
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the message editor should contain "AUTOSAVED_DRAFT"
    When I press "Escape" key
    Then I should not see an "editor" element with selector "[data-testid='message-edit-input']"
    When I hover the first user message
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the message editor should contain "AUTOSAVED_DRAFT"
    When I click on a "discard draft" element with selector "[data-testid='message-edit-discard']"
    And I hover the first user message
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the message editor should contain "ORIGINAL_QUESTION"
    When I type "EDITED_QUESTION" in "message edit" element with selector "[data-testid='message-edit-input']"
    And I click on a "save draft" element with selector "[data-testid='message-edit-save']"
    And I hover the first user message
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the message editor should contain "EDITED_QUESTION"
    When I click on a "send edited message" element with selector "[data-testid='message-edit-send']"
    Then I should see 2 messages in chat history
    And I should see a "new branch reply" element with selector "[data-testid='assistant-message']:has-text('EDITED_BRANCH_REPLY')"
    And the edited model request should exclude the original continuation
    And the timeline should mark a message with alternative histories
    When I hover the first user message
    And I click on a "previous history" element with selector "[data-testid='message-branch-previous']"
    Then I should see 4 messages in chat history
    And I should see an "original continuation" element with selector "[data-testid='assistant-message']:has-text('ORIGINAL_LATER_REPLY')"
    When I hover the first user message
    And I click on a "next history" element with selector "[data-testid='message-branch-next']"
    Then I should see 2 messages in chat history
    And I should see an "edited continuation" element with selector "[data-testid='assistant-message']:has-text('EDITED_BRANCH_REPLY')"

  @agent @mockOpenAI @conversationEditing
  Scenario: The assistant shows status before a delayed failure and settles afterwards
    Given the next model request fails after a delay
    When I type "Check failure status" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see an "actionable provider error" element with selector "[data-testid='error-message']"
    And I should not see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see a "send icon" element with selector "[data-testid='send-icon']"

  @agent @mockOpenAI @conversationEditing
  Scenario: Pending status appears before a delayed successful response
    Given the next model request succeeds after a delay
    When I type "Check pending success" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see an "assistant reply" element with selector "[data-testid='assistant-message']:has-text('DELAYED_REPLY')"
    And I should not see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"

  @agent @mockOpenAI @conversationEditing
  Scenario: A pending response can be cancelled
    Given the next model request succeeds after a delay
    When I type "Cancel pending response" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    When I click on a "cancel response" element with selector "[data-testid='cancel-icon']"
    Then I should not see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see a "send icon" element with selector "[data-testid='send-icon']"

  @agent @mockOpenAI @conversationEditing
  Scenario: Rendered HTML cannot execute scripts
    Given I add mock OpenAI responses:
      | response | stream |
      | <strong>HTML_RENDERED</strong><script>window.chatScriptExecuted=true</script> | false |
    When I choose the "wiki" workspace for this conversation
    And I type "Render HTML safely" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And rendered message scripts should not execute in the host or frame

  @agent @mockOpenAI @conversationEditing
  Scenario: Selected running wiki renders wikitext and preserves its selection
    Given I add mock OpenAI responses:
      | response | stream |
      | ''WIKI_RENDERED_BOLD'' | false |
    When I choose the "wiki" workspace for this conversation
    And I type "Render a wiki response" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And the assistant should render bold wiki text "WIKI_RENDERED_BOLD"
    When I reload the conversation window
    Then the conversation workspace selection should be "wiki"
    And the assistant should render bold wiki text "WIKI_RENDERED_BOLD"

  @agent @mockOpenAI @conversationEditing @messageAppearance
  Scenario: Message surfaces and shared tools work in both themes
    Given I add mock OpenAI responses:
      | response | stream |
      | ''TOOLBAR_REPLY'' | false |
    When I choose the "wiki" workspace for this conversation
    And I type "''TOOLBAR_QUESTION''" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And the assistant should render bold wiki text "TOOLBAR_REPLY"
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    And message surfaces and shared tools should work in "light" theme
    And message surfaces and shared tools should work in "dark" theme

  @agent @mockOpenAI @conversationEditing @advancedWikitext
  Scenario: Complete conversations render tables variables macros filters and transclusions
    Given the model echoes the advanced wikitext sample
    When I choose the "wiki" workspace for this conversation
    And I send the advanced wikitext sample
    Then I should see 2 messages in chat history
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    And both completed messages render advanced wikitext in "light" theme
    And both completed messages render advanced wikitext in "dark" theme
    When I reload the conversation window
    Then both completed messages render advanced wikitext in "dark" theme
