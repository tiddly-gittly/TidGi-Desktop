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

    # Step 6: Fill model form (simple - just model name)
    When I type "test-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds

    # Create a second model to be used as the default embedding model
    When I click on an "add model button" element with selector "[data-testid='add-new-model-button']"
    And I wait for 0.2 seconds
    When I type "test-embedding-model" in "model name input" element with selector "[data-testid='new-model-name-input']"
    # Select embedding feature checkbox so this model can be used as embedding model
    When I click on a "embedding feature checkbox" element with selector "[data-testid='feature-checkbox-embedding']"
    When I click on a "save model button" element with selector "[data-testid='save-model-button']"
    And I wait for 0.2 seconds

    # Step 7: Set default model
    # Fill the primary default model autocomplete (first matching input)
    When I type "test-model" in "default model autocomplete" element with selector "xpath=(//input[contains(@class,'MuiAutocomplete-input')])[1]"
    And I wait for 0.2 seconds
    And I click on a "default model autocomplete" element with selector "xpath=(//input[contains(@class,'MuiAutocomplete-input')])[1]"
    And I click on a "default model option in MUI Autocomplete listbox that contains the model name" element with selector "ul[role='listbox'] li.MuiAutocomplete-option:has-text('test-model')"
    And I wait for 0.2 seconds

    # Fill the embedding default model autocomplete (second matching input)
    When I type "test-embedding-model" in "default embedding model autocomplete" element with selector "xpath=(//input[contains(@class,'MuiAutocomplete-input')])[2]"
    And I wait for 0.2 seconds
    And I click on a "default embedding model autocomplete" element with selector "xpath=(//input[contains(@class,'MuiAutocomplete-input')])[2]"
    And I click on a "default embedding model option in MUI Autocomplete listbox that contains the model name" element with selector "ul[role='listbox'] li.MuiAutocomplete-option:has-text('test-embedding-model')"
    And I wait for 0.2 seconds

    # Ensure embedding feature checkbox is checked for embedding-capable model
    # (already set when creating the model above; redundant step removed to avoid timing issues)

    # Step 8: Close preferences window
    When I close "preferences" window
    And I wait for 0.2 seconds
    And I switch to "main" window
    And I wait for 0.2 seconds
    And I ensure test ai settings exists
