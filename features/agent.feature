Feature: Agent Workflow - Tool Usage and Multi-Round Conversation
  As a user
  I want to use an intelligent agent to search wiki content
  So that I can get AI-powered explanations of wiki entries

  Background:
    Given I add test ai settings
    # Start mock OpenAI server with no rules - rules will be added per scenario
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Navigate to agent workspace for all scenarios
    And I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"

  @agent @mockOpenAI @modelParameters
  Scenario: Model parameters open for the current conversation
    Given the test model has catalog metadata:
      """
      {"reasoning":true,"reasoningEfforts":["low","high"],"temperature":true,"limit":{"output":8192}}
      """
    When I click on a "current model parameters button" element with selector "[data-testid='conversation-model-parameters']"
    Then I should see a "current conversation model parameters dialog" element with selector "[data-testid='conversation-model-parameters-dialog'] [role='dialog']"
    And I should see a "current model name" element with selector "[data-testid='conversation-model-parameters-dialog'] h2:has-text('test-model')"
    When I click on a "reasoning selector" element with selector "[data-testid='conversation-model-parameters-dialog'] [role='combobox']"
    Then I should see "supported reasoning options" elements with selectors:
      | element description | selector |
      | default | [role='option']:text-is('模型默认值') |
      | low | [role='option']:text-is('低') |
      | high | [role='option']:text-is('高') |
    And I should not see an "unsupported fourth reasoning option" element with selector "[role='option'] >> nth=3"
    When I click on a "high reasoning effort" element with selector "[role='option']:text-is('高')"
    And I type "0.4" in "temperature" element with selector "[data-testid='conversation-model-parameters-dialog'] input[type='number'][max='2']"
    And I capture the current window as "model-parameters.png"
    And I click on a "save parameters" element with selector "[data-testid='conversation-model-parameters-dialog'] button:text-is('保存')"
    Then I should not see a "parameters dialog" element with selector "[data-testid='conversation-model-parameters-dialog']"
    When I click on a "reopen parameters" element with selector "[data-testid='conversation-model-parameters']"
    Then I should see a "saved reasoning effort" element with selector "[data-testid='conversation-model-parameters-dialog'] [role='combobox']:text-is('高')"
    And the "temperature" element with selector "[data-testid='conversation-model-parameters-dialog'] input[type='number'][max='2']" should have value "0.4"
    When I press "Escape" key
    Given I add mock OpenAI responses:
      | response | stream |
      | PARAMETER_ACCEPTANCE_COMPLETE | false |
    When I type "Verify selected parameters" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then the last AI request should have parameters:
      | reasoning_effort | "high" |
      | temperature | 0.4 |
      | top_p | 0.95 |
    Then I should see a "conversation message input" element with selector "[data-testid='agent-message-input']"

  @agent @mockOpenAI @modelParameters
  Scenario: A running chat uses the newly selected default model
    Given I add mock OpenAI responses:
      | response | stream |
      | FIRST_MODEL_REPLY | false |
      | SWITCHED_MODEL_REPLY | false |
    When I type "Verify the first route" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "first reply" element with selector "[data-testid='message-bubble']:has-text('FIRST_MODEL_REPLY')"
    And the last AI request should have parameters:
      | model | "test-model" |
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on an "external services section" element with selector "[data-testid='preference-section-externalAPI']"
    And I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I type "test-model-alternate" in "provider model ID" element with selector "[data-testid='new-model-name-input']"
    And I type "Alternate test model" in "model display name" element with selector "[data-testid='new-model-display-name-input']"
    And I click on a "save model button" element with selector "[data-testid='save-new-model-button']"
    Then I should see an "added model" element with selector "[data-testid='model-chip-test-model-alternate']:has-text('Alternate test model')"
    When I click on a "default model picker" element with selector "[data-testid='default-model-selector'] button[title='打开']"
    And I click on an "alternate model" element with selector "[role='option']:has-text('Alternate test model')"
    Then I should see a "selected default model" element with selector "[data-testid='default-model-selector'] input[value='Alternate test model']"
    When I close "preferences" window
    And I switch to "main" window
    And I type "Verify the new route" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "second reply" element with selector "[data-testid='message-bubble']:has-text('SWITCHED_MODEL_REPLY')"
    And the last AI request should have parameters:
      | model | "test-model-alternate" |

  @agent @mockOpenAI @conversationTitle
  Scenario: Generate a new title without editing the conversation
    Given I add mock OpenAI responses:
      | response | stream |
      | OPENING_TITLE_REPLY | false |
      | UPDATED_TOPIC_REPLY | false |
    When I type "Plan the weekly review" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "first reply" element with selector "[data-testid='message-bubble']:has-text('OPENING_TITLE_REPLY')"
    When I click on a "generated opening title" element with selector "h6:text-is('Plan the weekly review')"
    And I clear text in "editable title" element with selector "input[aria-label='编辑对话标题']"
    And I type "Weekly review" in "editable title" element with selector "input[aria-label='编辑对话标题']"
    And I press "Enter" key
    When I type "Schedule the follow-up" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "second reply" element with selector "[data-testid='message-bubble']:has-text('UPDATED_TOPIC_REPLY')"
    And I should see a "title saved by the user" element with selector "h6:text-is('Weekly review')"
    When I click on a "generate title" element with selector "button[aria-label='生成标题']"
    Then I should see a "title from the latest topic" element with selector "h6:text-is('Schedule the follow-up')"
    When I click on a "chat list" element with selector "[data-testid='tab-list-button']"
    Then I should see an "updated title in the chat list" element with selector "[data-testid='tab-list-dropdown'] [data-tab-type='chat']:has-text('Schedule the follow-up')"

  @agent @mockOpenAI @promptExperience
  Scenario: Prompt preview includes history tools and unsent input in both views
    Given I add mock OpenAI responses:
      | response                 | stream | embedding | toolName    | toolArguments                                    |
      |                          | false  |           | wiki-search | {"workspaceName":"wiki","filter":"[title[Index]]"} |
      | PROMPT_HISTORY_ASSISTANT  | false  |           |             |                                                  |
    When I type "PROMPT_HISTORY_USER" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "final assistant response" element with selector "[data-testid='message-bubble']:has-text('PROMPT_HISTORY_ASSISTANT')"
    And I should not see a "pending run" element with selector "[data-testid='assistant-run-status']"
    When I type "UNSENT_PREVIEW_INPUT" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I click on a "prompt preview" element with selector "[data-testid='prompt-preview-button']"
    And I switch to "promptPreview" window
    Then I should see "prompt entries" elements with selectors:
      | element description | selector |
      | user history | [data-testid='prompt-preview-tree'] [data-prompt-entry-id]:has-text('PROMPT_HISTORY_USER') |
      | assistant history | [data-testid='prompt-preview-tree'] [data-prompt-entry-id]:has-text('PROMPT_HISTORY_ASSISTANT') |
      | tool | [data-testid='prompt-preview-tree'] [data-prompt-entry-id]:has-text('wiki-search') |
      | unsent input | [data-testid='prompt-preview-tree'] [data-prompt-entry-id]:has-text('UNSENT_PREVIEW_INPUT') |
    And I should not see an "untranslated tool description" element with selector "[data-testid='prompt-preview-tree'] [data-prompt-entry-id]:has-text('Schema.WikiSearch.')"
    When I remember the text and "data-prompt-entry-id" attribute of elements with selector "[data-testid='prompt-preview-tree'] [data-prompt-entry-id]" as "compiled prompt"
    And I capture the current window as "prompt-tree.png"
    And I hover on an "unsent prompt entry" element with selector "[data-testid='prompt-preview-tree'] [data-testid='prompt-preview-entry']:has-text('UNSENT_PREVIEW_INPUT')"
    And I capture the current window as "prompt-tree-history.png"
    And I click on a "flat message list tab" element with selector "[data-testid='prompt-execution-inspector'] [role='tab'] >> nth=1"
    Then the text and "data-prompt-entry-id" attribute of elements with selector "[data-testid='prompt-preview-flat'] [data-prompt-entry-id]" should match "compiled prompt"
    And I capture the current window as "prompt-flat.png"
    When I click on a "history message detail" element with selector "[data-testid='prompt-execution-inspector'] [data-testid='prompt-preview-entry']:has-text('PROMPT_HISTORY_ASSISTANT')"
    Then I should see a "history source" element with selector "[data-testid='prompt-preview-audit-detail'] pre:has-text('PROMPT_HISTORY_ASSISTANT')"
    When I press "Escape" key
    Then I should not see a "message detail" element with selector "[data-testid='prompt-preview-audit-detail']"
    And I should see a "prompt inspector" element with selector "[data-testid='prompt-execution-inspector']"
    When I click on a "complete model request" element with selector "[data-testid='prompt-preview-model-request-detail']"
    Then the paginated JSON in "[data-testid='prompt-preview-audit-detail'] pre" with next button "[data-testid='prompt-preview-audit-detail-next']" should contain these texts and exclude "Schema.WikiSearch.":
      | UNSENT_PREVIEW_INPUT |
    And I capture the current window as "prompt-request.png"
    When I click on a "return from request detail" element with selector "[data-testid='prompt-preview-detail-back']"
    And I click on a "prompt tree tab" element with selector "[data-testid='prompt-execution-inspector'] [role='tab'] >> nth=0"
    Then the text and "data-prompt-entry-id" attribute of elements with selector "[data-testid='prompt-preview-tree'] [data-prompt-entry-id]" should match "compiled prompt"
    When I click on an "editor toggle" element with selector "[role='switch'][aria-label='显示编辑']"
    Then I should see a "form editor tab" element with selector "[role='tab']:has-text('表单编辑')"
    And I capture the current window as "prompt-form.png"
    When I click on a "code editor tab" element with selector "[role='tab']:has-text('代码编辑')"
    Then I should see a "code editor" element with selector ".monaco-editor"
    And I capture the current window as "prompt-code.png"
    When I click on a "form editor tab" element with selector "[role='tab']:has-text('表单编辑')"
    And I close "promptPreview" window
    And I switch to "main" window
    Then the "unsent chat input" element with selector "[data-testid='agent-message-input']" should have value "UNSENT_PREVIEW_INPUT"

  @agent @mockOpenAI
  Scenario: Wiki-search tool usage
    # Add scenario-specific responses to the mock server
    Given I add mock OpenAI responses:
      | response                                                                                                                                                             | stream | embedding | toolName | toolArguments |
      |                                                                                                                                                                      | false  |           | wiki-search | {"workspaceName":"wiki","filter":"[title[Index]]"} |
      | 在 TiddlyWiki 中，Index 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。此外，它还引导您访问中文教程页面和官方英文站点以获取更多信息。 | false  |           |          | |
    # Proceed with agent workflow in main window
    # Create another conversation directly from the tab bar.
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Step 4: Send message to agent - using generic steps combination
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "搜索 wiki 中的 index 条目并解释" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    And the last AI request tool message should contain "Index"
    # Verify the last message contains the AI explanation about Index
    And I should see "explanation in last message and explanation about edit" elements with selectors:
      | element description         | selector                                                    |
      | explanation in last message | [data-testid='message-bubble']:has-text('Index') |
      | explanation about edit      | [data-testid='message-bubble']:has-text('编辑')  |

  @agent @mockOpenAI
  Scenario: Wiki operation
    # Add scenario-specific responses to the mock server
    Given I add mock OpenAI responses:
      | response                                                                                                                                                                                | stream | embedding | toolName | toolArguments |
      |                                                                                                                                                                                         | false  |           | wiki-operation | {"workspaceName":"test-expected-to-fail","operation":"wiki-add-tiddler","title":"testNote","text":"test"} |
      |                                                                                                                                                                                         | false  |           | wiki-operation | {"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"test","text":"这是测试内容"} |
      | 已成功在工作区 wiki 中创建条目 "test"。                                                                                                                                                 | false  |           |          | |
    # Step 1: Start a fresh tab and run the two-round wiki operation flow
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # First round: try create note using test-expected-to-fail workspace (expected to fail)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "在 wiki 里创建一个新笔记，内容为 test" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 6 messages in chat history
    # Verify error and success messages
    And I should see "workspace not exist error and success in last message and wiki workspace in last message" elements with selectors:
      | element description            | selector                                                                 |
      | workspace not exist error      | [data-testid='message-bubble']:has-text('test-expected-to-fail'):has-text('不存在') |
      | success in last message        | [data-testid='message-bubble']:has-text('已成功')             |
      | wiki workspace in last message | [data-testid='message-bubble']:has-text('wiki')               |

  @agent
  Scenario: Close all tabs then create default agent from fallback page
    # Ensure starting from black/fallback page with no open tabs
    # Open tab list dropdown and force-click all close buttons (they have opacity: 0)
    Given I click on a "tab list button" element with selector "[data-testid='tab-list-button']"
    And I should see a "tab list dropdown" element with selector "[data-testid='tab-list-dropdown']"
    When I click all "tab close button" elements matching selector "[data-testid^='tab-close-']"
    # The welcome page remains available when every conversation is closed.
    And I should see "new tab button and Create Default Agent" elements with selectors:
      | element description     | selector                                    |
      | new tab button          | [data-tab-id='new-tab-button']              |
      | Create Default Agent    | [data-testid='create-default-agent-button'] |
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Open dropdown again and close all tabs
    When I click on a "tab list button" element with selector "[data-testid='tab-list-button']"
    And I should see a "tab list dropdown" element with selector "[data-testid='tab-list-dropdown']"
    Then I click all "tab close button" elements matching selector "[data-testid^='tab-close-']"

  @agent @mockOpenAI
  Scenario: Streamed assistant response can be cancelled mid-stream and send button returns
    # Add scenario-specific responses to the mock server
    Given I add mock OpenAI responses:
      | response                                                                                               | stream |
      | partial_chunk_1<stream_split>partial_chunk_2<stream_split>partial_chunk_3<stream_split>partial_chunk_4 | true   |
    When I click on a "new conversation" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "Start long streaming" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    # Wait for streaming container to appear and contain the first chunk
    Then I should see "assistant streaming container and partial assistant text and cancel icon" elements with selectors:
      | element description           | selector                                 |
      | assistant streaming container | [data-testid='assistant-streaming-text'] |
      | partial assistant text        | *:has-text('partial_chunk_1')            |
      | cancel icon                   | [data-testid='cancel-icon']              |
    # Click cancel button mid-stream
    When I click on a "cancel button" element with selector "[data-testid='agent-send-button']"
    # Verify send button returned and stream stopped (no further chunks)
    Then I should see "send icon and send button" elements with selectors:
      | element description | selector                         |
      | send icon           | [data-testid='send-icon']        |
      | send button         | [data-testid='agent-send-button']|
    And I should not see a "partial chunk 4 text" element with selector "text='partial_chunk_4'"
