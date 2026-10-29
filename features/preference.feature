Feature: TidGi Preference
  As a user
  I want to configure my preferences for the intelligent agent and so on
  So that I can customize its behavior and improve my experience

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @ai-setting @calibrate
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
    When I type "test-provider" in "provider name input" element with selector "[data-testid='new-provider-name-input']"
    And I type "http://127.0.0.1:15121/v1" in "API endpoint input" element with selector "[data-testid='new-provider-base-url-input']"
    When I click on an "add provider submit" element with selector "[data-testid='add-provider-submit-button']"
    # Step 5: The newly added provider is selected automatically; add a model.
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    # Step 6: Add a language model (auto-fills the default language assignment).
    When I type "test-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on "save model button and add model button" elements with selectors:
      | element description  | selector                             |
      | save model button    | [data-testid='save-new-model-button'] |
      | add model button     | [data-testid='add-new-model-button'] |
    # Step 7: Model IDs containing "embedding" advertise embedding capability.
    When I type "test-embedding-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on "save model button and add model button" elements with selectors:
      | element description | selector                              |
      | save model button   | [data-testid='save-new-model-button'] |
      | add model button    | [data-testid='add-new-model-button']  |
    # Step 8: Output modality drives speech and image-generation assignments.
    When I type "test-speech-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I clear text in "output modalities input" element with selector "[data-testid='model-output-modalities-input']"
    And I type "audio" in "output modalities input" element with selector "[data-testid='model-output-modalities-input']"
    When I click on "save model button and add model button" elements with selectors:
      | element description | selector                              |
      | save model button   | [data-testid='save-new-model-button'] |
      | add model button    | [data-testid='add-new-model-button']  |
    When I type "test-image-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I clear text in "output modalities input" element with selector "[data-testid='model-output-modalities-input']"
    And I type "image" in "output modalities input" element with selector "[data-testid='model-output-modalities-input']"
    When I click on a "save model button" element with selector "[data-testid='save-new-model-button']"
    # Step 9: Verify canonical capability auto-fill through stable selector contracts.
    Then I should see "model assignments and chips" elements with selectors:
      | element description              | selector                                                                          |
      | default language model input     | [data-testid='default-model-selector'] input[value='test-model']                  |
      | default embedding model input    | [data-testid='embedding-model-selector'] input[value='test-embedding-model']      |
      | default speech model input       | [data-testid='speech-model-selector'] input[value='test-speech-model']            |
      | default image model input        | [data-testid='image-generation-model-selector'] input[value='test-image-model']   |
      | language model chip              | [data-testid='model-chip-test-model']                                             |
      | embedding model chip             | [data-testid='model-chip-test-embedding-model']                                   |
      | speech model chip                | [data-testid='model-chip-test-speech-model']                                      |
      | image model chip                 | [data-testid='model-chip-test-image-model']                                       |
    # Step 10: Close preferences window
    When I close "preferences" window
    And I ensure test ai settings exists

    # --- Part B: Background tasks — create a recurring Cron wake-up ---
    Then I switch to "main" window
    When I click on "agent workspace button and new tab button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | agent workspace             | [data-testid='workspace-agent']             |
      | new tab button              | [data-tab-id='new-tab-button']              |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I switch to "preferences" window
    And I click on a "ai agent section" element with selector "[data-testid='preference-section-aiAgent']"
    And I click on a "add scheduled task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see "shared scheduled task controls" elements with selectors:
      | element description        | selector                                             |
      | scheduled task dialog      | [data-testid='scheduled-task-dialog']                |
      | agent definition select    | [data-testid='scheduled-task-agent-definition-select'] |
      | scheduled task editor      | [data-testid='edit-agent-schedule-section']          |
      | schedule mode select       | [data-testid='edit-agent-schedule-mode-select']      |
    When I select "enabled" from MUI Select with test id "edit-agent-schedule-mode-select"
    And I wait for 1.5 seconds for "cron preview"
    Then I should see a "cron preview" element with selector "[data-testid='schedule-preview-dates']"
    When I click on a "save scheduled task button" element with selector "[data-testid='edit-agent-schedule-save-button']"
    Then I should see a "scheduled task selector" element with selector "[data-testid='edit-agent-scheduled-task-select']"
    When I click on a "close scheduled task dialog" element with selector "[data-testid='scheduled-task-cancel-button']"
    Then I should not see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
