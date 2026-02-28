Feature: Agent Tools - Ask-question variants and turn action bar
  As a user
  I want agent tools to render correctly and respond to interaction
  So that I can interact with the AI agent through various tool UIs

  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    And I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |

  @agentTool @mockOpenAI
  Scenario: Ask-question — single-select, multi-select, and text input in one session
    # All 6 mock responses are queued in FIFO order; each ask-question consumes 2
    Given I add mock OpenAI responses:
      | response                                                                                                                                                                                                                                                                                                                                                                                                     | stream |
      | <tool_use name="ask-question">{"question":"Which approach do you prefer?","inputType":"single-select","options":[{"label":"Approach A: Create separate tiddlers for each topic and link them","description":"This keeps content modular and easy to navigate"},{"label":"Approach B: Create one large tiddler with sections","description":"Simpler structure, all information in one place"}],"allowFreeform":true}</tool_use> | false  |
      | 好的，你选择了方法A。我将为每个主题创建独立的tiddler并链接它们。                                                                                                                                                                                                                                                                                                                                              | false  |
      | <tool_use name="ask-question">{"question":"Which tags should I add to the new tiddler?","inputType":"multi-select","options":[{"label":"AI","description":"Artificial Intelligence"},{"label":"Programming","description":"Software development"},{"label":"Notes","description":"Personal notes"}],"allowFreeform":false}</tool_use>                                                 | false  |
      | 好的，我将为tiddler添加 AI, Programming 两个标签。                                                                                                                                                                                                                                                                                                                                  | false  |
      | <tool_use name="ask-question">{"question":"What title should the new tiddler have?","inputType":"text","allowFreeform":true}</tool_use>                                                                                                                                                                                                                                             | false  |
      | 好的，我将创建标题为"My Custom Title"的tiddler。                                                                                                                                                                                                                                                                                                                                      | false  |
    # Create agent
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # ── Part 1: single-select ──
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "帮我整理笔记" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see an "ask question container" element with selector "[data-testid='ask-question-container']"
    And I should see "question text and two full-width options" elements with selectors:
      | element description | selector                                                      |
      | question text       | *:has-text('Which approach do you prefer?')                   |
      | option A            | [data-testid='ask-question-option-0']:has-text('Approach A')  |
      | option B            | [data-testid='ask-question-option-1']:has-text('Approach B')  |
    And I should not see a "raw tool use xml" element with selector "*:has-text('<tool_use')"
    When I click on a "option A button" element with selector "[data-testid='ask-question-option-0']"
    Then I should see an "agent response" element with selector "[data-testid='message-bubble']:has-text('方法A')"
    # ── Part 2: multi-select ──
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "创建一个笔记并添加标签" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see an "ask question container" element with selector "[data-testid='ask-question-container']:has-text('Which tags')"
    And I should see "multi-select options" elements with selectors:
      | element description | selector                                                          |
      | option AI           | [data-testid='ask-question-option-0']:has-text('AI')              |
      | option Programming  | [data-testid='ask-question-option-1']:has-text('Programming')     |
      | option Notes        | [data-testid='ask-question-option-2']:has-text('Notes')           |
    When I click on a "AI checkbox" element with selector "[data-testid='ask-question-option-0']"
    And I click on a "Programming checkbox" element with selector "[data-testid='ask-question-option-1']"
    Then I should see a "submit button" element with selector "[data-testid='ask-question-multiselect-submit']"
    When I click on a "submit button" element with selector "[data-testid='ask-question-multiselect-submit']"
    Then I should see an "agent response" element with selector "[data-testid='message-bubble']:has-text('AI')"
    # ── Part 3: text freeform ──
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "创建一个自定义标题的笔记" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see an "ask question container" element with selector "[data-testid='ask-question-container']:has-text('What title')"
    And I should see "freeform input" elements with selectors:
      | element description | selector                                  |
      | text input          | [data-testid='ask-question-text-input']   |
      | submit button       | [data-testid='ask-question-submit']       |
    When I type "My Custom Title" in "freeform input" element with selector "[data-testid='ask-question-text-input'] textarea:not([readonly])"
    And I click on a "submit button" element with selector "[data-testid='ask-question-submit']"
    Then I should see an "agent response" element with selector "[data-testid='message-bubble']:has-text('My Custom Title')"

  @agentTool @mockOpenAI
  Scenario: Turn action bar — delete, retry, and rollback-hidden in one session
    # Responses consumed in order: delete-target, retry-first, retry-replacement, rollback-check
    Given I add mock OpenAI responses:
      | response                                 | stream |
      | 这是要删除的回复。                       | false  |
      | 这是第一次回复。                         | false  |
      | 这是重试后的回复。                       | false  |
      | 这是纯文本回复，没有工具调用。           | false  |
    # Create agent
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # ── Part 1: Delete ── (1 turn → 0 turns, selector unambiguous)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "测试删除功能" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should see an "response" element with selector "[data-testid='message-bubble']:has-text('要删除的回复')"
    When I click on a "delete button" element with selector "[data-testid='turn-action-delete']"
    Then I should not see a "deleted response" element with selector "[data-testid='message-bubble']:has-text('要删除的回复')"
    # ── Part 2: Retry ── (0 turns → 1 turn, selector unambiguous)
    # After delete, old text may be in input — select-all then type to replace
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I press "Meta+a" key
    And I type "测试重试功能" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And I should see an "first response" element with selector "[data-testid='message-bubble']:has-text('第一次回复')"
    When I click on a "retry button" element with selector "[data-testid='turn-action-retry']"
    Then I should see 2 messages in chat history
    And I should see an "retried response" element with selector "[data-testid='message-bubble']:has-text('重试后的回复')"
    # ── Part 3: Rollback hidden ── (1 turn → 2 turns, both plain text)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "简单问题" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    And I should not see a "rollback button" element with selector "[data-testid='turn-action-rollback']"
    And I should not see a "files changed chip" element with selector "[data-testid='turn-files-changed']"

  @agentTool @mockOpenAI
  Scenario: Agent switcher — switch between Task Agent and Plan Agent
    Given I add mock OpenAI responses:
      | response                           | stream |
      | Task Agent 模式的回复。            | false  |
      | Plan Agent 模式的回复。            | false  |
    # Create agent (default = Task Agent)
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Verify switcher shows current agent name
    Then I should see an "agent switcher" element with selector "[data-testid='agent-switcher-button']"
    # Send message with Task Agent
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "Task Agent测试" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see an "task agent response" element with selector "[data-testid='message-bubble']:has-text('Task Agent 模式')"
    # Switch to Plan Agent via the switcher dropdown
    When I click on a "agent switcher button" element with selector "[data-testid='agent-switcher-button']"
    Then I should see an "agent switcher dropdown" element with selector "[data-testid='agent-switcher-dropdown']"
    And I should see a "plan agent option" element with selector "[data-testid='agent-switcher-option-plan-agent']"
    When I click on a "plan agent option" element with selector "[data-testid='agent-switcher-option-plan-agent']"
    # After switching, chat history resets (new agent instance), input should be available
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Send message with Plan Agent
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "Plan Agent测试" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see an "plan agent response" element with selector "[data-testid='message-bubble']:has-text('Plan Agent 模式')"
    # Verify wiki-operation tool is NOT in system prompt (Plan mode disables it)
    And the last AI request system prompt should not contain "wiki-operation"
