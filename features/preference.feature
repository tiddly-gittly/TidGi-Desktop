Feature: TidGi Preference
  As a user
  I want to configure my preferences for the intelligent agent and so on
  So that I can customize its behavior and improve my experience

  Background:
    Given I clear test ai settings
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @setup
  Scenario: Configure AI provider and default model
    # Step 1: Configure AI settings first - Open preferences window, wait a second so its URL settle down.
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I wait for 0.2 seconds
    When I switch to "preferences" window
    # Step 2: Navigate to External Services section (wait for sidebar animation)
    When I click on an "external services section" element with selector "[data-testid='preference-section-externalAPI']"
    # Step 3: Add new provider
    When I click on an "add provider button" element with selector "[data-testid='add-new-provider-button']"
    # Step 4: Fill provider form with mock server details (interface type already selected as openAICompatible)
    When I type "TestProvider" in "provider name input" element with selector "[data-testid='new-provider-name-input']"
    And I type "http://127.0.0.1:15121/v1" in "API endpoint input" element with selector "[data-testid='new-provider-base-url-input']"
    When I click on an "add provider submit" element with selector "[data-testid='add-provider-submit-button']"
    And I wait for 0.2 seconds
    # Step 5: Select the new provider and add a model
    When I click on a "provider tab" element with selector "button[role='tab']:has-text('TestProvider')"
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds
    # Step 6: Add language model (will auto-fill as default language model)
    When I type "test-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds
    # Step 7: Add embedding model (will auto-fill as default embedding model)
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds
    When I type "test-embedding-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on a "embedding feature checkbox" element with selector "[data-testid='feature-checkbox-embedding']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds
    # Step 8: Add speech model (will auto-fill as default speech model)
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds
    When I type "test-speech-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    # Uncheck language feature first (it's checked by default)
    When I click on a "language feature checkbox" element with selector "[data-testid='feature-checkbox-language']"
    When I click on a "speech feature checkbox" element with selector "[data-testid='feature-checkbox-speech']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds
    # Step 9: Verify auto-fill worked by checking that autocomplete inputs have the correct selected values
    # MUI Autocomplete shows selected value in the input, we check by looking for the model name in the visible text
    Then I should see a "default language model value test-model" element with selector "text='test-model'"
    # Verify the autocomplete is not empty
    Then I should not see a "empty first autocomplete placeholder" element with selector "xpath=(//label[contains(text(),'Preference.SelectModel')])[1]"
    # Verify auto-fill worked - check default embedding model
    Then I should see a "default embedding model value test-embedding-model" element with selector "text='test-embedding-model'"
    # Verify negative case - should not see language model name duplicated where embedding model should be
    Then I should not see a "test-model after test-embedding-model (wrong order)" element with selector "xpath=//input[@value='test-embedding-model']/following::input[@value='test-model']"
    # Verify auto-fill worked - check default speech model
    Then I should see a "default speech model value test-speech-model" element with selector "text='test-speech-model'"
    # Verify there are exactly 3 filled model selectors
    Then I should see a "first autocomplete input with test-model" element with selector "xpath=(//div[contains(@class,'MuiAutocomplete-root')]//input[@value='test-model'])[1]"
    Then I should see a "second autocomplete input with test-embedding-model" element with selector "xpath=(//div[contains(@class,'MuiAutocomplete-root')]//input[@value='test-embedding-model'])[1]"
    Then I should see a "third autocomplete input with test-speech-model" element with selector "xpath=(//div[contains(@class,'MuiAutocomplete-root')]//input[@value='test-speech-model'])[1]"
    # Step 10: Add ComfyUI provider with workflow path
    When I click on an "add provider button" element with selector "[data-testid='add-new-provider-button']"
    And I wait for 0.2 seconds
    When I click on a "select from preset dropdown" element with selector "div[role='combobox']"
    When I click on a "comfyui preset option" element with selector "li:has-text('comfyui')"
    When I click on an "add provider submit" element with selector "[data-testid='add-provider-submit-button']"
    And I wait for 0.2 seconds
    When I click on a "provider tab" element with selector "button[role='tab']:has-text('comfyui')"
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds
    When I type "test-flux" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on a "language feature checkbox" element with selector "[data-testid='feature-checkbox-language']"
    When I click on a "imageGeneration feature checkbox" element with selector "[data-testid='feature-checkbox-imageGeneration']"
    When I type "C:/test/mock/workflow.json" in "workflow path input" element with selector "[data-testid='workflow-path-input']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds
    Then I should see a "test-flux model chip" element with selector "[data-testid='model-chip-test-flux']"
    # Verify workflow path was saved by clicking to edit
    When I click on a "test-flux model chip" element with selector "[data-testid='model-chip-test-flux']"
    And I wait for 0.2 seconds
    Then I should see a "workflow path input with value" element with selector "[data-testid='workflow-path-input'][value='C:/test/mock/workflow.json']"
    When I press "Escape" key
    And I wait for 0.1 seconds
    # Step 11: Close preferences window
    When I close "preferences" window
    And I wait for 0.1 seconds
    And I ensure test ai settings exists
