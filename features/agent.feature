Feature: Agent Workflow - Tool Usage and Multi-Round Conversation
  As a user
  I want to use an intelligent agent to search wiki content
  So that I can get AI-powered explanations of wiki entries

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Ensure we are in the correct workspace before each scenario to avoid wrong starting state
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  @agent
  Scenario: Wiki-search tool usage
    Given I have started the mock OpenAI server
      | response                                                                                                                                                                                                                                                         | stream |
      | <tool_use name="wiki-search">{"workspaceName":"-VPTqPdNOEZHGO5vkwllY","filter":"[title[Index]]"}</tool_use>                                                                                                                                                | false  |
      | 在 TiddlyWiki 中，Index 条目提供了编辑卡片的方法说明，点击右上角的编辑按钮可以开始对当前卡片进行编辑。此外，它还引导您访问中文教程页面和官方英文站点以获取更多信息。 | false  |
    # Step 1: Configure AI settings first - Open preferences window, wait a second so its URL settle down.
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I wait for 0.5 seconds
    When I switch to "preferences" window

    # Step 2: Navigate to External Services section (wait for sidebar animation)
    When I click on an "external services section" element with selector "[data-testid='preference-section-externalAPI']"

    # Step 3: Add new provider
    When I click on an "add provider button" element with selector "[data-testid='add-new-provider-button']"

    # Step 4: Fill provider form with mock server details (interface type already selected as openAICompatible)
    When I type "TestProvider" in "provider name input" element with selector "[data-testid='new-provider-name-input']"
    And I type "MOCK_SERVER_URL" in "API endpoint input" element with selector "[data-testid='new-provider-base-url-input']"
    When I click on an "add provider submit" element with selector "[data-testid='add-provider-submit-button']"
    And I wait for 0.2 seconds

    # Step 5: Select the new provider and add a model
    When I click on a "provider tab" element with selector "button[role='tab']:has-text('TestProvider')"
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds

    # Step 6: Fill model form (simple - just model name)
    When I type "test-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds

    # Step 7: Set default model
    When I type "test-model" in "default model autocomplete" element with selector ".MuiAutocomplete-input"
    And I press "Enter" key
    And I wait for 0.5 seconds

    # Step 8: Close preferences window
    When I close "preferences" window
    And I switch to "main" window
    And I wait for 0.5 seconds

    # Step 9: Now proceed with agent workflow in main window

    # Step 10: Click new tab button
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"

    # Step 11: Click search box and wait for autocomplete
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"

    # Step 12: Select agent from autocomplete (not new tab)
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"

    # Step 13: Send message to agent - using generic steps combination
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "搜索 wiki 中的 index 条目并解释" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 0.5 seconds
    And I should see a "user message" element with selector "*:has-text('搜索 wiki 中的 index 条目并解释')"
    And I should see a "tool use indicator" element with selector "*:has-text('tool_use')"
    And I should see a "wiki search tool" element with selector "*:has-text('wiki-search')"
    And I should see a "workspace name" element with selector "*:has-text('workspaceName')"
    And I should see a "function result" element with selector "*:has-text('functions_result')"
    And I should see a "tool indicator" element with selector "*:has-text('Tool: wiki-search')"
    Then I should see 4 messages in chat history

  @agent
  Scenario: Wiki operation
    Given I have started the mock OpenAI server
      | response                                                                                                       | stream |
      | <tool_use name="wiki-operation">{"workspaceName":"default","operation":"wiki-add-tiddler","title":"testNote","text":"test"}</tool_use> | false  |
      | <tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"test","text":"这是测试内容"}</tool_use> | false  |
      | 已成功在工作区 wiki 中创建条目 "test"。                                                                        | false  |
    
    # Step 1: Configure AI settings first - Open preferences window, wait a second so its URL settle down.
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I wait for 0.5 seconds
    When I switch to "preferences" window

    # Step 2: Navigate to External Services section (wait for sidebar animation)
    When I click on an "external services section" element with selector "[data-testid='preference-section-externalAPI']"

    # Step 3: Add new provider
    When I click on an "add provider button" element with selector "[data-testid='add-new-provider-button']"

    # Step 4: Fill provider form with mock server details (interface type already selected as openAICompatible)
    When I type "TestProvider" in "provider name input" element with selector "[data-testid='new-provider-name-input']"
    And I type "MOCK_SERVER_URL" in "API endpoint input" element with selector "[data-testid='new-provider-base-url-input']"
    When I click on an "add provider submit" element with selector "[data-testid='add-provider-submit-button']"
    And I wait for 0.2 seconds

    # Step 5: Select the new provider and add a model
    When I click on a "provider tab" element with selector "button[role='tab']:has-text('TestProvider')"
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds

    # Step 6: Fill model form (simple - just model name)
    When I type "test-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds

    # Step 7: Set default model
    When I type "test-model" in "default model autocomplete" element with selector ".MuiAutocomplete-input"
    And I press "Enter" key
    And I wait for 0.5 seconds

    # Step 8: Close preferences window
    When I close "preferences" window
    And I switch to "main" window
    And I wait for 0.5 seconds

    # Step 9: Start a fresh tab and run the two-round wiki operation flow
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"

    # Step 10: Click search box and wait for autocomplete
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"

    # Step 11: Select agent from autocomplete (not new tab)
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"

    # First round: try create note using default workspace (expected to fail)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "在 wiki 里创建一个新笔记，内容为 test" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    And I should see a "user message" element with selector "*:has-text('在 wiki 里创建一个新笔记，内容为 test')"
    And I should see a "tool use indicator" element with selector "*:has-text('tool_use')"
    And I should see a "wiki operation tool" element with selector "*:has-text('wiki-operation')"
    And I wait for 2 seconds
    And I should see a "function result error" element with selector "*:has-text('functions_result')"
    And I should see a "workspace not found" element with selector "*:has-text('Workspace with name or ID \"default\" does not exist')"

    # Second round: assistant suggests wiki workspace and operation succeeds (automated by assistant/tool)
    And I wait for 2 seconds
    And I should see a "assistant suggestion" element with selector "*:has-text('tool_use')"
    And I should see a "tool use indicator" element with selector "*:has-text('tool_use')"
    And I should see a "wiki operation tool" element with selector "*:has-text('wiki-operation')"
    And I wait for 2 seconds
    And I should see a "function result success" element with selector "*:has-text('functions_result')"
    And I wait for 5 seconds
    And I should see a "success message" element with selector "*:has-text('Successfully added tiddler')"
    And I wait for 2 seconds
    And I should see a "assistant confirmation" element with selector "*:has-text('已成功在工作区 wiki 中创建条目')"
    Then I should see 6 messages in chat history
