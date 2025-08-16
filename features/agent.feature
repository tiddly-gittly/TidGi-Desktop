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
    # Step 1: Click agent workspace in sidebar
    When I click on an "agent workspace button" element with selector "button"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    
    # Step 2: Click new tab button
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    
    # Step 3: Click search box and wait for autocomplete
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    
    # Step 4: Select agent from autocomplete (not new tab)
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector 'textarea.MuiInputBase-input.MuiOutlinedInput-input[placeholder*="输入消息"]'
    
    # Step 5: Type message and send
    When I focus the message input "chat input box" and type "搜索 wiki 中的 index 条目并解释" and press Enter
    And I should see text "搜索 wiki 中的 index 条目并解释"
    
    # Step 6: Wait for AI tool call
    And I should see text "tool_use"
    And I should see text "wiki-search"
    And I should see text "workspaceName"
    
    # Step 7: Wait for tool execution result
    And I should see text "functions_result"
    And I should see text "Tool: wiki-search"
    
    # Step 8: Check final message count (wait for streaming to complete)
    Then I should see 4 messages in chat history
