Feature: Create New Agent Workflow
  As a user
  I want to create a new agent definition using a multi-step wizard
  So that I can customize agents for specific tasks and use them immediately

  Background:
    Given I add test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Ensure we are in the correct workspace before each scenario
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  @newAgent
  Scenario: Verify step navigation and content rendering
    # Setup mock OpenAI server first
    Given I have started the mock OpenAI server
      | response | stream |
      | 作为代码助手，我可以帮您解决编程问题。请问需要什么帮助？ | false |
      
    # Step 1: Open new tab and navigate to CreateNewAgent
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I wait for 0.2 seconds
    When I click on a "create new agent button" element with selector "[data-testid='create-new-agent-button']"
    And I wait for 0.1 seconds
    
    # Step 2: Verify first step content (Setup Agent: Name + Template)
    And I should see a "step title" element with selector "*:has-text('设置智能体')"
    And I should see a "search input" element with selector ".aa-Input"
    And I should see a "agent name input field" element with selector "[data-testid='agent-name-input-field']"
    
    # Step 3: Select template to advance to step 2
    When I click on a "search input" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    When I click on a "agent suggestion" element with selector '[data-autocomplete-source-id="templateAgentsSource"] .aa-ItemWrapper'
    And I wait for 0.2 seconds
    
    # Fill in agent name while still in step 1
    When I clear text in "agent name input" element with selector "[data-testid='agent-name-input-field']"
    When I type "我的代码助手" in "agent name input" element with selector "[data-testid='agent-name-input-field']"
    
    # Advance to step 2 (Edit Prompt)
    When I click on a "next button" element with selector "[data-testid='next-button']"
    And I wait for 0.2 seconds
    
    # Step 4: Verify second step content (Edit Prompt)
    And I should see a "edit prompt title" element with selector "*:has-text('编辑提示词')"
    
    # Step 4.1: Wait for PromptConfigForm to load
    And I wait for 0.2 seconds
    # Verify the PromptConfigForm is present with our new test id
    And I should see a "prompt config form" element with selector "[data-testid='prompt-config-form']"
    
    # Step 4.2: Navigate to the correct tab and expand array items to edit prompt
    # Look for tabs in the PromptConfigForm
    And I should see a "config tabs" element with selector "[data-testid='prompt-config-form'] .MuiTabs-root"
    # Click on the first tab (which should contain the system prompt)
    When I click on a "first config tab" element with selector "[data-testid='prompt-config-form'] .MuiTab-root:first-of-type"
    And I wait for 0.2 seconds
    
    # Step 4.3: Expand the first array item (prompt item) by clicking the expand button
    When I click on a "expand array item button" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) button[title*='展开'], [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) button svg[data-testid='ExpandMoreIcon']"
    And I wait for 0.2 seconds
    
    # Step 4.4: Now find and edit the system prompt text field (textarea)
    When I click on a "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    When I clear text in "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    When I type "你是一个专业的代码助手，请用中文回答编程问题。" in "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    And I wait for 0.2 seconds
    
    # Step 5: Advance to step 3 (Immediate Use)
    When I click on a "next button" element with selector "[data-testid='next-button']"
    And I wait for 0.2 seconds
    
    # Step 6: Verify third step content (Immediate Use with chat interface)
    And I should see a "immediate use title" element with selector "*:has-text('测试并使用')"
    
    # Step 7: Test in the preview chat interface (part of step 3)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "帮我写个 Hello World" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 0.1 seconds
    
    # Verify the agent responds in the preview interface
    Then I should see a "user message" element with selector "*:has-text('帮我写个 Hello World')"
    And I should see a "assistant message" element with selector "*:has-text('作为代码助手')"
    And the last AI request should contain system prompt "你是一个专业的代码助手，请用中文回答编程问题。"

    # Step 8: Save and start using (after testing in step 3)
    When I click on a "save and use button" element with selector "button:has-text('保存并使用智能体')"
    And I wait for 0.1 seconds

    # Verify agent was created and separate chat tab opened
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"
