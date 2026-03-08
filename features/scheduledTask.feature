Feature: Scheduled Tasks Management
  As a user
  I want to manage scheduled tasks for agents
  So that agents can wake up automatically on a schedule and I can see which tabs have active tasks

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @scheduled-tasks @preferences
  Scenario: Preferences — view, add interval task, and verify cron preview
    # Part A: View and add a scheduled task
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on an "ai-agent section" element with selector "[data-testid='preference-section-aiAgent']"
    Then I should see a "Scheduled Tasks section" element with selector "[data-testid='scheduled-tasks-table'], h6"
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"
    When I wait for 0.5 seconds
    Then I should not see a "dialog" element with selector "[data-testid='scheduled-task-dialog']"

    # Part B: Create an interval scheduled task
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    Then I should see a "mode select" element with selector "[data-testid='scheduled-task-mode-select']"
    Then I should see a "interval input" element with selector "[data-testid='scheduled-task-interval-input']"
    When I type "Periodic check-in for test" in "message input" element with selector "[data-testid='scheduled-task-message-input'] textarea"
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
    Given there is a default TidGi wiki workspace
    When I wait for "2000" ms
    When I navigate to an agent tab
    When I click on an "edit agent definition button" element with selector "[data-testid^='edit-agent-def']"
    Then I should see a "schedule section" element with selector "[data-testid='edit-agent-schedule-section']"
    Then I should see a "schedule mode select" element with selector "[data-testid='edit-agent-schedule-mode-select']"

    # Part B: Tab shows clock icon when agent has active scheduled task
    Then I should see a "chat input area" element with selector ".chat-input, [data-testid='chat-input-area']"
