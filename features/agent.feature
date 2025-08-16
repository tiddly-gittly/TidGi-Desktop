Feature: Agent Workflow - Tool Usage and Multi-Round Conversation
  As a user
  I want to use an intelligent agent to search wiki content
  So that I can get AI-powered explanations of wiki entries

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @agent
  Scenario: Complete agent workflow with tool usage and multi-round conversation
    # Step 1: Configure AI settings first - Open preferences window
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I wait for 2 seconds
    When I switch to "preferences" window
    
    # Step 2: Navigate to External Services section (wait for sidebar animation)
    And I wait for 3 seconds
    When I switch to "preferences" window
    When I click on an "external services section" element with selector "[data-testid='preference-section-externalAPI']"
    
    # Step 3: Add new provider
    When I click on an "add provider button" element with selector "button:has-text('添加新提供商')"
    
    # Step 4: Fill provider form with mock server details (interface type already selected as openAICompatible)
    When I type "TestProvider" in "provider name input" element with selector "label:has-text('提供商名称') + div input"
    And I type "MOCK_SERVER_URL" in "API endpoint input" element with selector "label:has-text('API 地址') + div input"
    When I click on an "add provider submit" element with selector "button:has-text('添加提供商')"
    
    # Step 5: Select the new provider and add a model
    When I click on a "provider tab" element with selector "button[role='tab']:has-text('TestProvider')"
    When I click on an "add model button" element with selector "button:has-text('添加新模型')"
    
    # Step 6: Fill model form (simple - just model name)
    When I type "test-model" in "model name input" element with selector ".MuiDialogContent-root input[type='text']:first-of-type"
    When I click on a "save model button" element with selector "button:has-text('保存')"
    
    # Step 7: Set default model
    When I type "test-model" in "default model autocomplete" element with selector ".MuiAutocomplete-input"
    And I press "Enter" key
    
    # Step 8: Close preferences window
    When I close "preferences" window
    
    # Step 9: Now proceed with agent workflow in main window
    When I click on an "agent workspace button" element with selector "button"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    
    # Step 10: Click new tab button
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    
    # Step 11: Click search box and wait for autocomplete
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    
    # Step 12: Select agent from autocomplete (not new tab)
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector 'textarea.MuiInputBase-input'
    
    # Step 13: Send message to agent - using generic steps combination
    When I click on a "message input textarea" element with selector "textarea.MuiInputBase-input"
    When I type "搜索 wiki 中的 index 条目并解释" in "chat input" element with selector "textarea.MuiInputBase-input"
    And I press "Enter" key
    And I should see a "user message" element with selector "*:has-text('搜索 wiki 中的 index 条目并解释')"
    And I should see a "tool use indicator" element with selector "*:has-text('tool_use')"
    And I should see a "wiki search tool" element with selector "*:has-text('wiki-search')" 
    And I should see a "workspace name" element with selector "*:has-text('workspaceName')"
    And I should see a "function result" element with selector "*:has-text('functions_result')"
    And I should see a "tool indicator" element with selector "*:has-text('Tool: wiki-search')"
    Then I should see 4 messages in chat history
