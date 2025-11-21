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

  @newAgent @mockOpenAI
  Scenario: Create new agent definition and edit prompt and check server request
    # Setup mock OpenAI server first
    Given I have started the mock OpenAI server
      | response                                                 | stream |
      | 作为代码助手，我可以帮您解决编程问题。请问需要什么帮助？ | false  |
    # Step 1: Open new tab and navigate to CreateNewAgent
    When I click on "new tab button and create new agent button" elements with selectors:
      | [data-tab-id='new-tab-button']          |
      | [data-testid='create-new-agent-button'] |
    # Step 2: Verify first step content (Setup Agent: Name + Template)
    Then I should see "step title and search input and agent name input field" elements with selectors:
      | *:has-text('设置智能体')               |
      | .aa-Input                              |
      | [data-testid='agent-name-input-field'] |
    # Step 3: Select template to advance to step 2
    When I click on a "search input" element with selector ".aa-Input"
    # Immediately click on the Example Agent template (don't wait or panel will close)
    # Using description text to select specific agent, more precise than just name
    When I click on a "Example Agent template" element with selector '.aa-Item[role="option"]:has-text("Example agent with prompt processing")'
    # Fill in agent name while still in step 1
    When I clear text in "agent name input" element with selector "[data-testid='agent-name-input-field']"
    When I type "我的代码助手" in "agent name input" element with selector "[data-testid='agent-name-input-field']"
    # Advance to step 2 (Edit Prompt)
    When I click on a "next button" element with selector "[data-testid='next-button']"
    # Step 4: Verify second step content (Edit Prompt) - using text selector as a diagnostic
    And I should see a "edit prompt title" element with selector "h6:has-text('编辑提示词')"
    # Step 4.1: Wait for PromptConfigForm to load
    # Verify the PromptConfigForm is present with our new test id
    And I should see a "prompt config form" element with selector "[data-testid='prompt-config-form']"
    # Step 4.2: Navigate to the correct tab and expand array items to edit prompt
    # Look for tabs in the PromptConfigForm
    And I should see a "config tabs" element with selector "[data-testid='prompt-config-form'] .MuiTabs-root"
    # Click on the first tab, expand array item, and click on the system prompt text field
    When I click on "first config tab and expand array item button and system prompt text field" elements with selectors:
      | [data-testid='prompt-config-form'] .MuiTab-root:first-of-type                                                                                                                                         |
      | [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) button[title*='展开'], [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) button svg[data-testid='ExpandMoreIcon'] |
      | [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])                                                                                              |
    When I clear text in "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    And I wait for 0.1 seconds for "clear to complete and DOM to stabilize"
    When I type "你是一个专业的代码助手，请用中文回答编程问题。" in "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    And I wait for 0.2 seconds for "form content save to backend"
    # Step 5: Advance to step 3 (Immediate Use)
    When I click on a "next button" element with selector "[data-testid='next-button']"
    # Step 6: Verify third step content (Immediate Use with chat interface)
    And I should see a "immediate use title" element with selector "*:has-text('测试并使用')"
    # Step 7: Test in the preview chat interface (part of step 3)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "帮我写个 Hello World" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    # Verify the agent responds in the preview interface
    Then I should see "user message and assistant message" elements with selectors:
      | *:has-text('帮我写个 Hello World') |
      | *:has-text('作为代码助手')         |
    And the last AI request should contain system prompt "你是一个专业的代码助手，请用中文回答编程问题。"
    # Step 8: Save and start using (after testing in step 3)
    When I click on a "save and use button" element with selector "button:has-text('保存并使用智能体')"
    # Verify agent was created and separate chat tab opened
    Then I should see a "message input box" element with selector "[data-testid='agent-message-input']"

  @editAgentDefinition @mockOpenAI
  Scenario: Edit existing agent definition workflow
    # Setup mock OpenAI server first
    Given I have started the mock OpenAI server
      | response                                                         | stream |
      | 作为已编辑的代码助手，我可以帮您解决编程问题。请问需要什么帮助？ | false  |
    # Step 1: Open new tab to access create default agent card
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    # Step 2: Right-click on create default agent card to open context menu
    When I right-click on a "create default agent card" element with selector "[data-testid='create-default-agent-button']"
    # Step 3: Click on edit definition option in context menu
    When I click on a "edit definition menu item" element with selector "[data-testid='edit-definition-menu-item']"
    # Step 4: Verify direct edit interface (no steps - all content visible)
    And I should see "edit agent title and basic info section and edit prompt section and immediate use section" elements with selectors:
      | *:has-text('编辑智能体定义') |
      | *:has-text('编辑基本信息')   |
      | *:has-text('编辑提示词')     |
      | *:has-text('测试并使用')     |
    # Step 5: Edit agent name in the basic info section
    And I should see a "agent name input" element with selector "[data-testid='edit-agent-name-input']"
    When I clear text in "agent name input" element with selector "[data-testid='edit-agent-name-input-field']"
    When I type "编辑后的示例智能体" in "agent name input" element with selector "[data-testid='edit-agent-name-input-field']"
    # Step 6: Edit the prompt configuration - Wait for PromptConfigForm to load
    # Verify the PromptConfigForm is present
    And I should see a "prompt config form" element with selector "[data-testid='edit-agent-prompt-form']"
    # Step 6.1: Navigate to the correct tab and expand array items to edit prompt
    # Look for tabs in the PromptConfigForm
    And I should see a "config tabs" element with selector "[data-testid='edit-agent-prompt-form'] .MuiTabs-root"
    # Click on the first tab, expand array item, and click on the system prompt text field
    When I click on "first config tab and expand array item button and system prompt text field" elements with selectors:
      | [data-testid='edit-agent-prompt-form'] .MuiTab-root:first-of-type                                                                                                                                             |
      | [data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) button[title*='展开'], [data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) button svg[data-testid='ExpandMoreIcon'] |
      | [data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])                                                                                                  |
    When I clear text in "system prompt text field" element with selector "[data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    When I type "你是一个经过编辑的专业代码助手，请用中文详细回答编程问题。" in "system prompt text field" element with selector "[data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    # Step 7: Test in the immediate use section (embedded chat)
    # The immediate use section should show an embedded chat interface
    # Find a message input in the immediate use section and test the agent
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "你好，请介绍一下自己" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    # Verify the agent responds in the embedded chat
    Then I should see "user message and assistant message" elements with selectors:
      | *:has-text('你好，请介绍一下自己') |
      | *:has-text('已编辑的代码助手')     |
    # Verify that the server received the request with the modified system prompt
    And the last AI request should contain system prompt "你是一个经过编辑的专业代码助手，请用中文详细回答编程问题。"
    # Step 8: Save the edited agent definition
    And I should see a "save button" element with selector "[data-testid='edit-agent-save-button']"
    When I click on a "save button" element with selector "[data-testid='edit-agent-save-button']"
