Feature: Scheduled Tasks Management
  As a user
  I want to manage scheduled tasks for agents
  So that agents can wake up automatically on a schedule and I can see which tabs have active tasks

  @scheduled-tasks @preferences @agent-tab
  Scenario: Scheduled tasks — preferences UI and agent definition editor
    Given I cleanup test wiki so it could create a new one on start
    Given I add test ai settings
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

    # Create a durable conversation. Scheduled tasks cannot belong to a
    # volatile preview or to a definition without a conversation.
    When I click on "agent workspace button and new tab button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | agent workspace             | [data-testid='workspace-agent']             |
      | new tab button              | [data-tab-id='new-tab-button']              |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"

    # --- Part A: Open the shared scheduled-task editor from preferences ---
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on an "ai-agent section" element with selector "[data-testid='preference-section-aiAgent']"
    Then I should see a "Scheduled Tasks section" element with selector "[data-testid='scheduled-tasks-settings']"
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    Then I should see a "shared scheduled task editor" element with selector "[data-testid='edit-agent-schedule-section']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"
    Then I should not see a "dialog" element with selector "[data-testid='scheduled-task-dialog']"

    # --- Part B: Create a recurring Cron scheduled task ---
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    Then I should see a "mode select" element with selector "[data-testid='edit-agent-schedule-mode-select']"
    When I select "enabled" from MUI Select with test id "edit-agent-schedule-mode-select"
    And I wait for 1.5 seconds for "cron preview"
    Then I should see a "cron preview" element with selector "[data-testid='schedule-preview-dates']"
    When I click on a "save button" element with selector "[data-testid='edit-agent-schedule-save-button']"
    Then I should see a "scheduled task selector" element with selector "[data-testid='edit-agent-scheduled-task-select']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"
    When I close "preferences" window

    # --- Part C: Agent tab — the same shared schedule editor ---
    Then I switch to "main" window
    When I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |
    When I right-click on a "create default agent card" element with selector "[data-testid='create-default-agent-button']"
    When I click on a "edit definition menu item" element with selector "[data-testid='edit-definition-menu-item']"
    Then I should see a "schedule section" element with selector "[data-testid='edit-agent-schedule-section']"
    Then I should see a "schedule mode select" element with selector "[data-testid='edit-agent-schedule-mode-select']"
