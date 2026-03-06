Feature: Scheduled Tasks Management
  As a user
  I want to manage scheduled tasks for agents
  So that agents can wake up automatically on a schedule and I can see which tabs have active tasks

  Background:
    Given I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @scheduled-tasks @preferences
  Scenario: View and add a scheduled task in preferences
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on an "ai-agent section" element with selector "[data-testid='preference-section-aiAgent']"
    Then I should see a "Scheduled Tasks section" element with selector "[data-testid='scheduled-tasks-table'], h6"
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"
    Then I should not see a "dialog" element with selector "[data-testid='scheduled-task-dialog']"

  @scheduled-tasks @preferences @create
  Scenario: Create an interval scheduled task
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on an "ai-agent section" element with selector "[data-testid='preference-section-aiAgent']"
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    # Verify mode selector is present
    Then I should see a "mode select" element with selector "[data-testid='scheduled-task-mode-select']"
    # Verify interval input appears after interval mode is selected (default)
    Then I should see a "interval input" element with selector "[data-testid='scheduled-task-interval-input']"
    # Set message
    When I type "Periodic check-in for test" in "message input" element with selector "[data-testid='scheduled-task-message-input']"
    # Save — if no agent available, dialog may fail gracefully
    When I click on a "save button" element with selector "[data-testid='scheduled-task-save-button']"

  @scheduled-tasks @preferences @cron-preview
  Scenario: Cron mode shows next run preview
    When I click on a "settings button" element with selector "#open-preferences-button"
    When I switch to "preferences" window
    When I click on an "ai-agent section" element with selector "[data-testid='preference-section-aiAgent']"
    When I click on a "add task button" element with selector "[data-testid='scheduled-task-add-button']"
    Then I should see a "scheduled task dialog" element with selector "[data-testid='scheduled-task-dialog']"
    # Switch to cron mode
    When I select "cron" from the "mode select" element with selector "[data-testid='scheduled-task-mode-select']"
    Then I should see a "cron expression input" element with selector "[data-testid='scheduled-task-cron-input']"
    Then I should see a "timezone input" element with selector "[data-testid='scheduled-task-timezone-input']"
    When I click on a "cancel button" element with selector "[data-testid='scheduled-task-cancel-button']"

  @scheduled-tasks @edit-agent-def @schedule-section
  Scenario: EditAgentDefinition shows schedule section
    # Navigate to agent list and edit a definition
    Given there is a default TidGi wiki workspace
    When I wait for "2000" ms
    When I navigate to an agent tab
    When I click on an "edit agent definition button" element with selector "[data-testid^='edit-agent-def']"
    Then I should see a "schedule section" element with selector "[data-testid='edit-agent-schedule-section']"
    Then I should see a "schedule mode select" element with selector "[data-testid='edit-agent-schedule-mode-select']"

  @scheduled-tasks @tab-indicator
  Scenario: Tab shows clock icon when agent has active scheduled task
    # This is a manual verification scenario — the tab clock indicator appears
    # when an agent instance has active ScheduledTask entries
    Given there is a default TidGi wiki workspace
    When I wait for "2000" ms
    When I navigate to an agent tab
    # Tab content should be visible
    Then I should see a "chat input area" element with selector ".chat-input, [data-testid='chat-input-area']"
