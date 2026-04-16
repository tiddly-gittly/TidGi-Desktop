@siliconflow
Feature: SiliconFlow request debug for agent workspace
  As a dogfooding user
  I want to control TidGi in a test-like startup mode and inspect SiliconFlow request debug output
  So that I can verify custom agent prompts are composed correctly

  Background:
    Given I add siliconflow test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  Scenario: Enable request debug in settings and inspect custom prompt request metadata
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on a "developer tools section" element with selector "[data-testid='preference-section-developers']"
    And I set checkbox with selector "[data-testid='external-api-debug-switch'] input" to "checked"
    And I close "preferences" window
    And I switch to "main" window

    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I click on a "create new agent button" element with selector "[data-testid='create-new-agent-button']"
    Then I should see a "agent name input field" element with selector "[data-testid='agent-name-input-field']"
    When I click on a "search input" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    And I click on a "Example Agent template" element with selector ".aa-Item[role='option']:has-text('General-purpose TiddlyWiki AI assistant')"
    And I clear text in "agent name input" element with selector "[data-testid='agent-name-input-field']"
    And I type "SiliconFlow 调试智能体" in "agent name input" element with selector "[data-testid='agent-name-input-field']"
    And I click on a "next button" element with selector "[data-testid='next-button']"
    Then I should see a "prompt config form" element with selector "[data-testid='prompt-config-form']"
    When I click on "first config tab and expand array item button and system prompt text field" elements with selectors:
      | element description      | selector                                                                                                                                                                                              |
      | first config tab         | [data-testid='prompt-config-form'] .MuiTab-root:first-of-type                                                                                                                                         |
      | expand array item button | [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) button[title*='展开'], [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) button svg[data-testid='ExpandMoreIcon'] |
      | system prompt text field | [data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])                                                                                              |
    And I clear text in "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    And I type "你是一个专门用于验证 SiliconFlow 请求调试信息的智能体。" in "system prompt text field" element with selector "[data-testid='prompt-config-form'] [role='tabpanel']:not([hidden]) textarea[id*='_text']:not([readonly])"
    And I click on a "next button" element with selector "[data-testid='next-button']"
    Then I should see a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    And I type "请总结一下这个调试请求是否正确" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key

    Then the external API debug log should include provider "siliconflow" and model "Qwen/Qwen3.5-122B-A10B"
    And the latest external API debug log should show system prompt "SiliconFlow 请求调试信息" and user prompt "请总结一下这个调试请求是否正确"
