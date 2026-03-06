Feature: TidGi Preference
  As a user
  I want to configure my preferences for the intelligent agent and so on
  So that I can customize its behavior and improve my experience

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @ai-setting
  Scenario: Configure AI provider and default model
    # Step 1: Configure AI settings first - Open preferences window, wait a second so its URL settle down.
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    # Step 2: Navigate to External Services section and add new provider
    When I click on "external services section and add provider button" elements with selectors:
      | element description       | selector                                       |
      | external services section | [data-testid='preference-section-externalAPI'] |
      | add provider button       | [data-testid='add-new-provider-button']        |
    # Step 4: Fill provider form with mock server details (interface type already selected as openAICompatible)
    When I type "TestProvider" in "provider name input" element with selector "[data-testid='new-provider-name-input']"
    And I type "http://127.0.0.1:15121/v1" in "API endpoint input" element with selector "[data-testid='new-provider-base-url-input']"
    When I click on an "add provider submit" element with selector "[data-testid='add-provider-submit-button']"
    # Step 5: Select the new provider and add a model
    When I click on "provider tab and add model button" elements with selectors:
      | element description       | selector                                    |
      | provider tab TestProvider | button[role='tab']:has-text('TestProvider') |
      | add model button          | [data-testid='add-new-model-button']        |
    # Step 6: Add language model (will auto-fill as default language model)
    When I type "test-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on "save model button and add model button" elements with selectors:
      | element description  | selector                             |
      | save model button    | [data-testid='save-model-button']    |
      | add model button     | [data-testid='add-new-model-button'] |
    # Step 7: Add embedding model (will auto-fill as default embedding model)
    When I type "test-embedding-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on "embedding feature checkbox and save model button and add model button" elements with selectors:
      | element description         | selector                                   |
      | embedding feature checkbox  | [data-testid='feature-checkbox-embedding'] |
      | save model button           | [data-testid='save-model-button']          |
      | add model button            | [data-testid='add-new-model-button']       |
    # Step 8: Add speech model (will auto-fill as default speech model)
    When I type "test-speech-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    # Uncheck language feature first (it's checked by default)
    When I click on "language feature checkbox and speech feature checkbox and save model button" elements with selectors:
      | element description        | selector                                  |
      | language feature checkbox  | [data-testid='feature-checkbox-language'] |
      | speech feature checkbox    | [data-testid='feature-checkbox-speech']   |
      | save model button          | [data-testid='save-model-button']         |
    # Step 9: Verify auto-fill worked by checking that autocomplete inputs have the correct selected values
    # MUI Autocomplete shows selected value in the input, we check by looking for the model name in the visible text
    Then I should see "model values and autocomplete inputs" elements with selectors:
      | element description                                      | selector                                                                                       |
      | default language model value test-model                  | text='test-model'                                                                              |
      | default embedding model value test-embedding-model       | text='test-embedding-model'                                                                    |
      | default speech model value test-speech-model             | text='test-speech-model'                                                                       |
      | first autocomplete input with test-model                 | xpath=(//div[contains(@class,'MuiAutocomplete-root')]//input[@value='test-model'])[1]         |
      | second autocomplete input with test-embedding-model      | xpath=(//div[contains(@class,'MuiAutocomplete-root')]//input[@value='test-embedding-model'])[1] |
      | third autocomplete input with test-speech-model          | xpath=(//div[contains(@class,'MuiAutocomplete-root')]//input[@value='test-speech-model'])[1]  |
    # Verify the autocomplete is not empty and negative case remain explicit
    Then I should not see a "empty first autocomplete placeholder" element with selector "xpath=(//label[contains(text(),'Preference.SelectModel')])[1]"
    Then I should not see a "test-model after test-embedding-model (wrong order)" element with selector "xpath=//input[@value='test-embedding-model']/following::input[@value='test-model']"
    # Step 10: Add ComfyUI provider with workflow path
    When I click on "add provider button and select from preset dropdown and comfyui preset option and add provider submit and provider tab and add model button" elements with selectors:
      | element description           | selector                                   |
      | add provider button           | [data-testid='add-new-provider-button']    |
      | select from preset dropdown   | div[role='combobox']                       |
      | comfyui preset option         | li:has-text('comfyui')                     |
      | add provider submit button    | [data-testid='add-provider-submit-button'] |
      | provider tab comfyui          | button[role='tab']:has-text('comfyui')     |
      | add model button              | [data-testid='add-new-model-button']       |
    When I type "test-flux" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on "language feature checkbox and imageGeneration feature checkbox" elements with selectors:
      | element description              | selector                                         |
      | language feature checkbox        | [data-testid='feature-checkbox-language']        |
      | imageGeneration feature checkbox | [data-testid='feature-checkbox-imageGeneration'] |
    When I type "C:/test/mock/workflow.json" in "workflow path input" element with selector "[data-testid='workflow-path-input']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    Then I should see a "test-flux model chip" element with selector "[data-testid='model-chip-test-flux']"
    # Verify workflow path was saved by clicking to edit
    When I click on a "test-flux model chip" element with selector "[data-testid='model-chip-test-flux']"
    Then I should see a "workflow path input with value" element with selector "[data-testid='workflow-path-input'][value='C:/test/mock/workflow.json']"
    When I press "Escape" key
    # Step 11: Close preferences window
    When I close "preferences" window
    And I ensure test ai settings exists

  @ai-setting
  Scenario: Create countdown background alarm from AI Agent preferences
    When I click on "agent workspace button and new tab button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | agent workspace             | [data-testid='workspace-agent']             |
      | new tab button              | [data-tab-id='new-tab-button']              |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on a "ai agent section" element with selector "[data-testid='preference-section-aiAgent']"
    And I click on a "add background task button" element with selector "[data-testid='bg-task-add-button']"
    Then I should see "countdown and message input" elements with selectors:
      | element description | selector                              |
      | countdown input     | [data-testid='bg-task-countdown-input'] |
      | message input       | [data-testid='bg-task-message-input']   |
    When I type "2" in "countdown input" element with selector "[data-testid='bg-task-countdown-input'] input"
    And I type "Preference-created countdown task" in "message input" element with selector "[data-testid='bg-task-message-input'] input"
    And I click on a "save background task button" element with selector "[data-testid='bg-task-save-button']"
    Then I should see a "created alarm cancel button" element with selector "[data-testid^='cancel-bg-task-'][data-testid$='-alarm']"

  @ai-setting
  Scenario: Edit and cancel background alarm from AI Agent preferences
    When I click on "agent workspace button and new tab button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | agent workspace             | [data-testid='workspace-agent']             |
      | new tab button              | [data-tab-id='new-tab-button']              |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on a "ai agent section" element with selector "[data-testid='preference-section-aiAgent']"
    And I click on a "add background task button" element with selector "[data-testid='bg-task-add-button']"
    When I type "3" in "countdown input" element with selector "[data-testid='bg-task-countdown-input'] input"
    And I type "Alarm task for edit" in "message input" element with selector "[data-testid='bg-task-message-input'] input"
    And I click on a "save background task button" element with selector "[data-testid='bg-task-save-button']"
    Then I should see a "created alarm edit button" element with selector "[data-testid^='edit-bg-task-'][data-testid$='-alarm']"
    When I click on a "alarm edit button" element with selector "[data-testid^='edit-bg-task-'][data-testid$='-alarm']"
    And I click on a "schedule mode select" element with selector "[data-testid='bg-task-mode-select']"
    And I click on a "interval mode option" element with selector "li[role='option']:has-text('Interval')"
    And I type "5" in "interval input" element with selector "[data-testid='bg-task-interval-input'] input"
    And I click on a "save background task button" element with selector "[data-testid='bg-task-save-button']"
    Then I should see a "repeat interval text" element with selector "*:has-text('repeat every 5min')"
    When I click on a "alarm cancel button" element with selector "[data-testid^='cancel-bg-task-'][data-testid$='-alarm']"
    Then I should not see a "alarm cancel button" element with selector "[data-testid^='cancel-bg-task-'][data-testid$='-alarm']"

  @ai-setting
  Scenario: Create and disable heartbeat from AI Agent preferences
    When I click on "agent workspace button and new tab button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | agent workspace             | [data-testid='workspace-agent']             |
      | new tab button              | [data-tab-id='new-tab-button']              |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on a "ai agent section" element with selector "[data-testid='preference-section-aiAgent']"
    And I click on a "add heartbeat button" element with selector "[data-testid='bg-heartbeat-add-button']"
    When I type "120" in "heartbeat interval input" element with selector "[data-testid='bg-heartbeat-interval-input'] input"
    And I type "Heartbeat from preferences" in "heartbeat message input" element with selector "[data-testid='bg-heartbeat-message-input'] input"
    And I click on a "save heartbeat button" element with selector "[data-testid='bg-heartbeat-save-button']"
    Then I should see a "heartbeat cancel button" element with selector "[data-testid^='cancel-bg-task-'][data-testid$='-heartbeat']"
    When I click on a "heartbeat edit button" element with selector "[data-testid^='edit-bg-task-'][data-testid$='-heartbeat']"
    And I click on a "heartbeat enabled select" element with selector "[data-testid='bg-heartbeat-enabled-select']"
    And I click on a "heartbeat disabled option" element with selector "li[role='option']:has-text('Disabled')"
    And I click on a "save heartbeat button" element with selector "[data-testid='bg-heartbeat-save-button']"
    Then I should not see a "heartbeat cancel button" element with selector "[data-testid^='cancel-bg-task-'][data-testid$='-heartbeat']"
