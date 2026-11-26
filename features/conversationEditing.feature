Feature: Shared conversation editing, status and wiki rendering
  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    When I click on an "agent workspace" element with selector "[data-testid='workspace-agent']"
    And I click on a "new conversation" element with selector "[data-tab-id='new-tab-button']"
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
    When I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    And I type "AUTOSAVED_DRAFT" in "message edit" element with selector "[data-testid='message-edit-input']"
    Then the stored edit draft for message "[data-memeloop-turn-anchor='true']" should be "AUTOSAVED_DRAFT"
    When I reload the current window
    And I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the "message editor" element with selector "[data-testid='message-edit-input']" should have value "AUTOSAVED_DRAFT"
    When I press "Escape" key
    Then I should not see an "editor" element with selector "[data-testid='message-edit-input']"
    When I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the "message editor" element with selector "[data-testid='message-edit-input']" should have value "AUTOSAVED_DRAFT"
    When I click on a "discard draft" element with selector "[data-testid='message-edit-discard']"
    And I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the "message editor" element with selector "[data-testid='message-edit-input']" should have value "ORIGINAL_QUESTION"
    When I type "EDITED_QUESTION" in "message edit" element with selector "[data-testid='message-edit-input']"
    And I click on a "save draft" element with selector "[data-testid='message-edit-save']"
    And I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit first question" element with selector "[data-testid='message-edit'] >> nth=0"
    Then the "message editor" element with selector "[data-testid='message-edit-input']" should have value "EDITED_QUESTION"
    When I click on a "send edited message" element with selector "[data-testid='message-edit-send']"
    Then I should see 2 messages in chat history
    And I should see "EDITED_BRANCH_REPLY" text in "[data-testid='assistant-message']" or its frames
    And the last AI request user message should contain "EDITED_QUESTION"
    And the last AI request should not contain "ORIGINAL_QUESTION"
    And the last AI request should not contain "ORIGINAL_LATER_QUESTION"
    And the last AI request should not contain "ORIGINAL_LATER_REPLY"
    And I should see an "accessible alternative history marker" element with selector "[data-testid='conversation-timeline'] [data-has-alternatives='true'][aria-label*='2'][aria-label*='替代历史']"
    And the "::after" pseudo-element of "[data-testid='conversation-timeline'] [data-has-alternatives='true']" should have "background-color" matching the "color" of "[data-testid='message-branches']"
    When I hover on an "alternative history marker" element with selector "[data-testid='conversation-timeline'] [data-has-alternatives='true']"
    Then I should see an "alternative history tooltip" element with selector "[role='tooltip']:has-text('替代历史')"
    When I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on a "previous history" element with selector "[data-testid='message-branch-previous']"
    Then I should see 4 messages in chat history
    And I should see "ORIGINAL_LATER_REPLY" text in "[data-testid='assistant-message']" or its frames
    When I hover on a "first user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on a "next history" element with selector "[data-testid='message-branch-next']"
    Then I should see 2 messages in chat history
    And I should see "EDITED_BRANCH_REPLY" text in "[data-testid='assistant-message']" or its frames

  @agent @mockOpenAI @conversationEditing
  Scenario: The assistant shows status before a delayed failure and settles afterwards
    Given I add mock OpenAI responses:
      | statusCode | delayMs |
      | 403 | 1500 |
    When I type "Check failure status" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see an "actionable provider error" element with selector "[data-testid='error-message']"
    And I should not see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see a "send icon" element with selector "[data-testid='send-icon']"

  @agent @mockOpenAI @conversationEditing
  Scenario: Pending status appears before a delayed successful response
    Given I add mock OpenAI responses:
      | response | stream | delayMs |
      | DELAYED_REPLY | true | 1500 |
    When I type "Check pending success" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"
    And I should see "DELAYED_REPLY" text in "[data-testid='assistant-message']" or its frames
    And I should not see a "pending assistant bubble" element with selector "[data-testid='assistant-run-status']"

  @agent @mockOpenAI @conversationEditing
  Scenario: A pending response can be cancelled
    Given I add mock OpenAI responses:
      | response | stream | delayMs |
      | DELAYED_REPLY | true | 1500 |
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
    When I click on a "conversation workspace" element with selector "[data-testid='conversation-workspace-select'] [role='combobox']"
    And I click on a "wiki option" element with selector "[role='option']:text-is('wiki')"
    And I type "Render HTML safely" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should see a "rendered HTML marker" element with selector "strong:has-text('HTML_RENDERED')" in frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']"
    And the window property "chatScriptExecuted" should be unset in the host and frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']" after rendering "strong"

  @agent @mockOpenAI @conversationEditing
  Scenario: Selected running wiki renders wikitext and preserves its selection
    Given I add mock OpenAI responses:
      | response | stream |
      | ''WIKI_RENDERED_BOLD'' | false |
    When I click on a "conversation workspace" element with selector "[data-testid='conversation-workspace-select'] [role='combobox']"
    And I click on a "wiki option" element with selector "[role='option']:text-is('wiki')"
    And I type "Render a wiki response" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should see a "rendered bold response" element with selector "strong:text-is('WIKI_RENDERED_BOLD')" in frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']"
    When I reload the current window
    Then I should see a "selected wiki" element with selector "[data-testid='conversation-workspace-select'] [role='combobox']:text-is('wiki')"
    And I should see a "restored bold response" element with selector "strong:text-is('WIKI_RENDERED_BOLD')" in frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']"

  @agent @mockOpenAI @conversationEditing @messageAppearance
  Scenario Outline: Message surfaces and shared tools work in both themes
    When I use the "<theme>" application theme
    Given I add mock OpenAI responses:
      | response | stream |
      | ''TOOLBAR_REPLY'' | false |
    When I click on a "conversation workspace" element with selector "[data-testid='conversation-workspace-select'] [role='combobox']"
    And I click on a "wiki option" element with selector "[role='option']:text-is('wiki')"
    And I type "''TOOLBAR_QUESTION''" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should see a "rendered toolbar reply" element with selector "strong:text-is('TOOLBAR_REPLY')" in frame "[data-testid='assistant-message'] iframe[data-testid='rendered-message']"
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    And the element with selector "<root> iframe[data-testid='rendered-message']" should be at most 30 pixels high
    And I should not see a "toolbar inside user surface" element with selector "[data-testid='user-message-surface'] [data-testid='message-toolbar']"
    When I focus on a "chat input" element with selector "[data-testid='agent-message-input']"
    And I hover on a "chat input" element with selector "[data-testid='agent-message-input']"
    Then I should see an "idle toolbar" element with selector "<root> [data-testid='message-toolbar']" with CSS property "opacity" equal to "0"
    And I capture the current window as "message-<theme>-<role>-idle.png"
    When I hover on a "message" element with selector "<root>"
    Then I should see a "revealed toolbar" element with selector "<root> [data-testid='message-toolbar']" with CSS property "opacity" equal to "1"
    And I capture the current window as "message-<theme>-<role>-hover.png"
    Given I clear the clipboard
    When I click on a "copy source" element with selector "<root> [data-testid='message-copy']"
    Then the clipboard should contain exactly "<source>"
    When I focus on a "chat input" element with selector "[data-testid='agent-message-input']"
    And I hover on a "chat input" element with selector "[data-testid='agent-message-input']"
    And I focus on a "copy source" element with selector "<root> [data-testid='message-copy']"
    Then I should see a "keyboard revealed toolbar" element with selector "<root> [data-testid='message-toolbar']" with CSS property "opacity" equal to "1"
    Given I clear the clipboard
    When I press "Enter" key
    Then the clipboard should contain exactly "<source>"
    And I should not see a "source toggle" element with selector "<root> [data-testid='message-render-toggle']"
    When I hover on a "user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit message" element with selector "[data-testid='message-edit']"
    And I type "TOOLBAR_DRAFT" in "message editor" element with selector "[data-testid='message-edit-input']"
    And I capture the current window as "message-<theme>-editing.png"
    And I press "Escape" key
    Then I should not see a "message editor" element with selector "[data-testid='message-edit-input']"
    When I hover on a "user message" element with selector "[data-memeloop-turn-anchor='true']"
    And I click on an "edit message" element with selector "[data-testid='message-edit']"
    Then the "message editor" element with selector "[data-testid='message-edit-input']" should have value "TOOLBAR_DRAFT"
    When I click on a "discard draft" element with selector "[data-testid='message-edit-discard']"
    And I use a touch viewport of 420 by 760
    And I focus on a "chat input" element with selector "[data-testid='agent-message-input']"
    And I hover on a "chat input" element with selector "[data-testid='agent-message-input']"
    Then I should see an "always visible touch toolbar" element with selector "<root> [data-testid='message-toolbar']" with CSS property "opacity" equal to "1"
    And I capture the current window as "message-<theme>-<role>-narrow-touch.png"
    Given I clear the clipboard
    When I tap on a "copy source" element with selector "<root> [data-testid='message-copy']"
    Then the clipboard should contain exactly "<source>"

    Examples:
      | theme | role | root | surface | source |
      | light | user | [data-memeloop-turn-anchor='true'] | [data-testid='user-message-surface'] | ''TOOLBAR_QUESTION'' |
      | light | assistant | [data-testid='message-bubble']:has([data-testid='assistant-message']) | [data-testid='message-bubble']:has([data-testid='assistant-message']) iframe | ''TOOLBAR_REPLY'' |
      | dark | user | [data-memeloop-turn-anchor='true'] | [data-testid='user-message-surface'] | ''TOOLBAR_QUESTION'' |
      | dark | assistant | [data-testid='message-bubble']:has([data-testid='assistant-message']) | [data-testid='message-bubble']:has([data-testid='assistant-message']) iframe | ''TOOLBAR_REPLY'' |

  @agent @mockOpenAI @conversationEditing @advancedWikitext
  Scenario Outline: Complete conversations render tables variables macros filters and transclusions
    When I use the "<theme>" application theme
    Given I add mock OpenAI responses:
      | responseFile | stream |
      | chat-rich-wikitext.txt | false |
    When I click on a "conversation workspace" element with selector "[data-testid='conversation-workspace-select'] [role='combobox']"
    And I click on a "wiki option" element with selector "[role='option']:text-is('wiki')"
    And I type fixture "chat-rich-wikitext.txt" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    And I should see an "expanded local variable" element with selector "tbody tr:has-text('变量已展开')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see an "expanded parameterized macro" element with selector "tbody tr:has-text('欢迎，宏已展开！')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "computed filter" element with selector "tbody tr:has-text('过滤器计算'):has-text('5')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "transcluded wiki field" element with selector "tbody tr:has-text('核心条目字段转入'):has(td:text-matches('[0-9]+[.][0-9]+[.][0-9]+'))" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see an "exact two item list" element with selector "ul:has(li:nth-child(1):text-is('Alpha')):has(li:nth-child(2):text-is('Beta')):not(:has(li:nth-child(3)))" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "bold table cell" element with selector "table strong:text-is('加粗')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see an "italic table cell" element with selector "table em:text-is('斜体')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "blockquote expansion" element with selector "blockquote:has-text('变量已展开')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "table border" element with selector "td" in frame "<root> iframe[data-testid='rendered-message']" with CSS property "border-top-style" equal to "solid"
    And I should not see a "source toggle" element with selector "<root> [data-testid='message-render-toggle']"
    When I hover on a "rendered message" element with selector "<root>"
    And I capture the current window as "advanced-wiki-<theme>-<role>.png"
    When I reload the current window
    Then I should see an "expanded local variable after reload" element with selector "tbody tr:has-text('变量已展开')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see an "expanded macro after reload" element with selector "tbody tr:has-text('欢迎，宏已展开！')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "computed filter after reload" element with selector "tbody tr:has-text('过滤器计算'):has-text('5')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "transcluded wiki field after reload" element with selector "tbody tr:has-text('核心条目字段转入'):has(td:text-matches('[0-9]+[.][0-9]+[.][0-9]+'))" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see an "exact list after reload" element with selector "ul:has(li:nth-child(1):text-is('Alpha')):has(li:nth-child(2):text-is('Beta')):not(:has(li:nth-child(3)))" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "bold cell after reload" element with selector "table strong:text-is('加粗')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see an "italic cell after reload" element with selector "table em:text-is('斜体')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "blockquote after reload" element with selector "blockquote:has-text('变量已展开')" in frame "<root> iframe[data-testid='rendered-message']"
    And I should see a "table border after reload" element with selector "td" in frame "<root> iframe[data-testid='rendered-message']" with CSS property "border-top-style" equal to "solid"
    And I should not see a "source toggle after reload" element with selector "<root> [data-testid='message-render-toggle']"
    When I hover on a "restored message" element with selector "<root>"
    And I capture the current window as "advanced-wiki-<theme>-<role>-restored.png"

    Examples:
      | theme | role | root |
      | light | user | [data-memeloop-turn-anchor='true'] |
      | light | assistant | [data-testid='message-bubble']:has([data-testid='assistant-message']) |
      | dark | user | [data-memeloop-turn-anchor='true'] |
      | dark | assistant | [data-testid='message-bubble']:has([data-testid='assistant-message']) |
