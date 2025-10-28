Feature: Agent Workflow - Tool Usage and Multi-Round Conversation
  As a user
  I want to use an intelligent agent to search wiki content
  So that I can get AI-powered explanations of wiki entries

  Background:
    Given I add test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Ensure we are in the correct workspace before each scenario to avoid wrong starting state
    And I click on "agent workspace button and new tab button" elements with selectors:
      | [data-testid='workspace-agent'] |
      | [data-tab-id='new-tab-button']  |

  @agent @mockOpenAI
  Scenario: Wiki-search tool usage
    Given I have started the mock OpenAI server
      | response                                                                                                                                                             | stream |
      | <tool_use name="wiki-search">{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}</tool_use>                                                          | false  |
      | 在 TiddlyWiki 中，Index 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。此外，它还引导您访问中文教程页面和官方英文站点以获取更多信息。 | false  |
    # Proceed with agent workflow in main window
    # Step 1: Click new tab button
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    # Step 2: Click search box and wait for autocomplete
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    # Step 3: Select agent from autocomplete (not new tab)
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Step 4: Send message to agent - using generic steps combination
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "搜索 wiki 中的 index 条目并解释" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    # Verify the last message contains the AI explanation about Index
    And I should see "explanation in last message and explanation about edit" elements with selectors:
      | [data-testid='message-bubble']:last-child:has-text('Index') |
      | [data-testid='message-bubble']:last-child:has-text('编辑')  |

  @agent @mockOpenAI
  Scenario: Wiki operation
    Given I have started the mock OpenAI server
      | response                                                                                                                                                                                | stream |
      | 先测试失败情况<tool_use name="wiki-operation">{"workspaceName":"test-expected-to-fail","operation":"wiki-add-tiddler","title":"testNote","text":"test"}</tool_use>                                    | false  |
      | 然后测试成功情况<tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"test","text":"这是测试内容"}</tool_use>使用启动时自动创建的 wiki 工作区 | false  |
      | 已成功在工作区 wiki 中创建条目 "test"。                                                                                                                                                 | false  |
    # Step 1: Start a fresh tab and run the two-round wiki operation flow
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    # Step 2: Click search box and wait for autocomplete
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    # Step 3: Select agent from autocomplete (not new tab)
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # First round: try create note using test-expected-to-fail workspace (expected to fail)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "在 wiki 里创建一个新笔记，内容为 test" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 6 messages in chat history
    # Verify there's an error message about workspace not found (in one of the middle messages)
    And I should see a "workspace not exist error" element with selector "[data-testid='message-bubble']:has-text('test-expected-to-fail'):has-text('不存在')"
    # Verify the last message contains success confirmation
    And I should see "success in last message and wiki workspace in last message" elements with selectors:
      | [data-testid='message-bubble']:last-child:has-text('已成功') |
      | [data-testid='message-bubble']:last-child:has-text('wiki')   |

  @agent
  Scenario: Create default agent from New Tab quick access
    When I click on "new tab button and create default agent button" elements with selectors:
      | [data-tab-id='new-tab-button']              |
      | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"

  @agent
  Scenario: Close all tabs then create default agent from fallback page
    # Ensure starting from black/fallback page with no open tabs
    Given I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    When I click all "tab" elements matching selector "[data-testid='tab']"
    When I click all "close tab button" elements matching selector "[data-testid='tab-close-button']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    # When there is no active tab, this is "fallback new tab", it has same thing as new tab.
    And I should see a "Create Default Agent" element with selector "[data-testid='create-default-agent-button']"
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "Create Default Agent" element with selector "[data-testid='create-default-agent-button']"
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    Then I click all "close tab button" elements matching selector "[data-testid='tab-close-button']"

  @agent @mockOpenAI
  Scenario: Streamed assistant response can be cancelled mid-stream and send button returns
    Given I have started the mock OpenAI server
      | response                                                                                               | stream |
      | partial_chunk_1<stream_split>partial_chunk_2<stream_split>partial_chunk_3<stream_split>partial_chunk_4 | true   |
    And I click on "new tab button and create default agent button" elements with selectors:
      | [data-tab-id='new-tab-button']              |
      | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "Start long streaming" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    # Wait for streaming container to appear and contain the first chunk
    Then I should see "assistant streaming container and partial assistant text and cancel icon" elements with selectors:
      | [data-testid='assistant-streaming-text'] |
      | *:has-text('partial_chunk_1')            |
      | [data-testid='cancel-icon']              |
    # Click cancel button mid-stream
    When I click on a "cancel button" element with selector "[data-testid='agent-send-button']"
    And I should see a "send icon" element with selector "[data-testid='send-icon']"
    # Verify send button returned and stream stopped (no further chunks)
    Then I should see a "send button" element with selector "[data-testid='agent-send-button']"
    And I should not see a "partial chunk 4 text" element with selector "text='partial_chunk_4'"
