Feature: Deep Link
  As a user
  When I use TidGi deep links
  I want them to open the intended page or workspace directly
  So that navigation works without manual switching

  Background:
    Given I remove test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @deep-link @config-error-button
  Scenario: Clicking "Open AI API Settings" in Edit Workspace opens preferences to External API section
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on "search section and generate embeddings button and open AI settings button" elements with selectors:
      | element description        | selector                                    |
      | search section             | [data-testid='preference-section-search']   |
      | generate embeddings button | [data-testid^='generate-embeddings-button-'] |
      | open AI settings button    | button:has-text('打开 AI API 设置')          |
    And I switch to "preferences" window
    Then I should see an "external API section" element with selector "[data-testid='preference-section-externalAPI']"

  @deep-link
  Scenario: Direct deep links open preferences and agent workspace
    When I trigger deep link "tidgi-test://preferences" as second instance would
    And I switch to "preferences" window
    Then I should see a "general section" element with selector "[data-testid='preference-section-general']"
    When I trigger deep link "tidgi-test://agent" as second instance would
    And I switch to "main" window
    Then I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"