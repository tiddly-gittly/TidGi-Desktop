Feature: Scheduled Tasks Management
  As a user
  I want to manage scheduled tasks for agents
  So that agents can wake up automatically on a schedule and I can see which tabs have active tasks

  @scheduled-tasks @preferences
  Scenario: Preferences — view, add interval task, and verify cron preview
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Part A: View and add a scheduled task
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on an "ai-agent section" element with selector "[data-testid='preference-section-aiAgent']"
    Then I should see a "Scheduled Tasks section" element with selector "[data-testid='scheduled-tasks-table'], h6"
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"
    Then I should not see a "dialog" element with selector "[data-testid='scheduled-task-dialog']"

    # Part B: Create an interval scheduled task
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    Then I should see a "mode select" element with selector "[data-testid='scheduled-task-mode-select']"
    Then I should see a "interval input" element with selector "[data-testid='scheduled-task-interval-input']"
    When I type "Periodic check-in for test" in "message input" element with selector "[data-testid='scheduled-task-message-input'] textarea:not([readonly])"
    When I click on a "save button" element with selector "[data-testid='scheduled-task-save-button']"

    # Part C: Cron mode shows next run preview
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    When I select "cron" from MUI Select with test id "scheduled-task-mode-select"
    Then I should see a "cron expression input" element with selector "[data-testid='scheduled-task-cron-input']"
    Then I should see a "timezone input" element with selector "[data-testid='scheduled-task-timezone-input']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"

  @scheduled-tasks @agent-tab
  Scenario: Agent tab — schedule section in definition editor and tab clock indicator
    # Part A: EditAgentDefinition shows schedule section
    Given I cleanup test wiki so it could create a new one on start
    Given I add test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    When I click on "agent workspace button and new tab button" elements with selectors:
      | element description | selector                        |
      | agent workspace     | [data-testid='workspace-agent'] |
      | new tab button      | [data-tab-id='new-tab-button']  |
    # Right-click on create default agent card to access edit definition
    When I right-click on a "create default agent card" element with selector "[data-testid='create-default-agent-button']"
    When I click on a "edit definition menu item" element with selector "[data-testid='edit-definition-menu-item']"
    Then I should see a "schedule section" element with selector "[data-testid='edit-agent-schedule-section']"
    Then I should see a "schedule mode select" element with selector "[data-testid='edit-agent-schedule-mode-select']"
