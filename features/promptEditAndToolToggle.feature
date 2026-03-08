Feature: Agent Prompt Editing and Tool Toggle
  As a user
  I want to edit agent prompts and toggle tools on/off
  So that I can customize agent behavior without creating a new agent

  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Navigate to agent workspace
    And I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  @promptEdit @mockOpenAI
  Scenario: Edit prompt text and verify it reaches AI server
    # Add mock response
    Given I add mock OpenAI responses:
      | response                               | stream |
      | 我是自定义提示词配置的助手，你好！     | false  |
    # Open edit agent definition page via right-click context menu on default agent
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    When I right-click on a "create default agent card" element with selector "[data-testid='create-default-agent-button']"
    When I click on a "edit definition menu item" element with selector "[data-testid='edit-definition-menu-item']"
    # Verify edit interface loaded
    And I should see a "prompt config form" element with selector "[data-testid='edit-agent-prompt-form']"
    And I should see a "config tabs" element with selector "[data-testid='edit-agent-prompt-form'] .MuiTabs-root"
    # Click first tab (prompts), expand first array item, and edit the system prompt text
    When I click on "first config tab and expand array item button and system prompt text field" elements with selectors:
      | element description        | selector                                                                                                                                                                                                      |
      | first config tab           | [data-testid='edit-agent-prompt-form'] .MuiTab-root:first-of-type                                                                                                                                             |
      | expand array item button   | [data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) button[title*='展开'], [data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) button svg[data-testid='ExpandMoreIcon'] |
      | system prompt text field   | [data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])                                                                                                  |
    When I clear text in "system prompt text field" element with selector "[data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    When I type "你是一个专门负责回答关于TidGi桌面应用问题的助手。" in "system prompt text field" element with selector "[data-testid='edit-agent-prompt-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    # Test in the embedded chat: send a message and verify modified prompt is used
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "你好" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    # Verify the edited prompt reached the server
    And the last AI request should contain system prompt "你是一个专门负责回答关于TidGi桌面应用问题的助手。"

  @toolToggle @mockOpenAI
  Scenario: Disable tool via plugins tab and verify it is excluded from prompt
    # Two mock responses: first with tool still potentially in prompt, second after disabling
    Given I add mock OpenAI responses:
      | response                                  | stream |
      | 第一次回复（工具启用时）                  | false  |
      | 第二次回复（工具禁用后）                  | false  |
    # Open edit agent definition page
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    When I right-click on a "create default agent card" element with selector "[data-testid='create-default-agent-button']"
    When I click on a "edit definition menu item" element with selector "[data-testid='edit-definition-menu-item']"
    And I should see a "prompt config form" element with selector "[data-testid='edit-agent-prompt-form']"
    # First send a message with all tools enabled to establish baseline
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "测试工具启用" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    # Verify wiki-search tool description IS in system prompt (baseline)
    And the last AI request should contain system prompt "wiki-search"
    # Now navigate to plugins tab (2nd tab due to ui:order, id=config-tab-1) and disable the wiki search tool
    When I click on a "plugins tab" element with selector "[data-testid='edit-agent-prompt-form'] #config-tab-1"
    # Wait for plugins array items to render after tab switch
    And I should see a "third plugin item checkbox" element with selector "[data-testid='array-item-enabled-2']"
    # Wiki search is at index 2 in the plugins array (0=fullReplacement/history, 1=workspacesList, 2=wikiSearch)
    # Click the enabled checkbox to uncheck/disable the wiki search tool
    When I click on a "wiki search tool enabled checkbox" element with selector "[data-testid='array-item-enabled-2']"
    # Wait for the preview agent to be recreated (form change triggers recreation with 500ms debounce)
    And I wait for 1.5 seconds for "preview agent recreation after form change"
    # Send another message and verify wiki-search is now absent from prompt
    # The preview agent was recreated so message count resets to 0
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "测试工具禁用" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    And the last AI request system prompt should not contain "wiki-search"
