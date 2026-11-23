Feature: Persistent agent goals
  Background:
    Given I add test ai settings
    And I have started the mock OpenAI server without rules
    When I launch the TidGi application
    And I wait for the page to load completely
    And I click on an "agent workspace" element with selector "[data-testid='workspace-agent']"
    And I click on a "new chat tab" element with selector "[data-tab-id='new-tab-button']"
    Then I should see a "message input" element with selector "[data-testid='agent-message-input']"

  @agent @mockOpenAI @agentGoal
  Scenario: A goal continues after an ordinary reply and finishes with verified evidence
    Given I add mock OpenAI responses:
      | response | stream | embedding | toolName | toolArguments |
      | GOAL_FIRST_ROUND_PROGRESS | false | | | |
      | | false | | goal | {"action":"complete","evidence":"GOAL_VERIFIED_TWO_ROUNDS"} |
      | GOAL_FINAL_RESULT | false | | | |
    When I click on a "goal button" element with selector "button:has-text('目标')"
    And I type "GOAL_ACCEPTANCE: Complete a two-round interface check." in "goal objective" element with selector "[role='dialog'] textarea:not([readonly])"
    And I click on a "start goal" element with selector "[role='dialog'] button:has-text('开始目标')"
    Then I should see a "completed goal" element with selector "[role='dialog'] .MuiChip-label:has-text('已完成')"
    And I should see a "completion evidence" element with selector "[role='dialog'] p:has-text('GOAL_VERIFIED_TWO_ROUNDS')"
    When I click on a "return to conversation" element with selector "[role='dialog'] button:has-text('返回')"
    Then I should see a "first goal reply" element with selector "[data-testid='message-bubble']:has-text('GOAL_FIRST_ROUND_PROGRESS')"
    And I should see a "final goal reply" element with selector "[data-testid='message-bubble']:has-text('GOAL_FINAL_RESULT')"
    When I reload the current window
    And I click on a "goal button" element with selector "button:has-text('目标')"
    Then I should see a "restored completion evidence" element with selector "[role='dialog'] p:has-text('GOAL_VERIFIED_TWO_ROUNDS')"

  @agent @agentGoal @agentLoopScript
  Scenario: The selected MJS workflow supplies the goal control
    When I right-click on a "conversation tab" element with selector "[data-tab-id]:has(svg[data-testid='ChatIcon'])"
    And I click on an "edit definition" element with selector "[data-testid='edit-definition-menu-item']"
    Then I should see a "script source editor" element with selector ".MuiFormControl-root:has(> label:text-is('JavaScript 源码')) textarea:not([readonly])"
    When I clear text in "script source" element with selector ".MuiFormControl-root:has(> label:text-is('JavaScript 源码')) textarea:not([readonly])"
    And I type "export default function run(ctx) { ctx.finish('MJS_CHAT_RESULT'); }" in "script source" element with selector ".MuiFormControl-root:has(> label:text-is('JavaScript 源码')) textarea:not([readonly])"
    And I click on a "save script" element with selector "button:has-text('保存脚本')"
    Then I should see a "saved script notice" element with selector "[role='alert']:has-text('脚本已保存')"
    When I click on a "conversation tab" element with selector "[data-tab-id]:has(svg[data-testid='ChatIcon'])"
    And I type "Run this workflow." in "message input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see a "workflow reply" element with selector "[data-testid='message-bubble']:has-text('MJS_CHAT_RESULT')"
    And I should not see a "goal button" element with selector "button:has-text('目标')"
    When I right-click on a "conversation tab" element with selector "[data-tab-id]:has(svg[data-testid='ChatIcon'])"
    And I click on an "edit definition" element with selector "[data-testid='edit-definition-menu-item']"
    And I clear text in "script source" element with selector ".MuiFormControl-root:has(> label:text-is('JavaScript 源码')) textarea:not([readonly])"
    And I type "export const capabilities = { goal: true }; export default async function run(ctx) { await ctx.goal.complete('MJS_GOAL_EVIDENCE'); ctx.finish('MJS_GOAL_RESULT'); }" in "script source" element with selector ".MuiFormControl-root:has(> label:text-is('JavaScript 源码')) textarea:not([readonly])"
    And I click on a "save script" element with selector "button:has-text('保存脚本')"
    Then I should see a "saved script notice" element with selector "[role='alert']:has-text('脚本已保存')"
    When I click on a "conversation tab" element with selector "[data-tab-id]:has(svg[data-testid='ChatIcon'])"
    And I click on a "goal button" element with selector "button:has-text('目标')"
    And I type "Run the saved custom loop and record its result." in "goal objective" element with selector "[role='dialog'] textarea:not([readonly])"
    And I click on a "start goal" element with selector "[role='dialog'] button:has-text('开始目标')"
    Then I should see a "script completion evidence" element with selector "[role='dialog'] p:has-text('MJS_GOAL_EVIDENCE')"
    When I click on a "return to conversation" element with selector "[role='dialog'] button:has-text('返回')"
    Then I should see a "script final reply" element with selector "[data-testid='message-bubble']:has-text('MJS_GOAL_RESULT')"
    When I reload the current window
    Then I should see a "restored script final reply" element with selector "[data-testid='message-bubble']:has-text('MJS_GOAL_RESULT')"

  @agent @mockOpenAI @agentGoal
  Scenario: A streaming goal stays paused after reload and resumes to completion
    Given I add mock OpenAI responses:
      | response | stream | embedding | toolName | toolArguments |
      | GOAL_PAUSE_PROGRESS<stream_split>GOAL_PENDING | true | | | |
      | | false | | goal | {"action":"complete","evidence":"GOAL_RESUMED_EVIDENCE"} |
      | GOAL_RESUMED_RESULT | false | | | |
    When I click on a "goal button" element with selector "button:has-text('目标')"
    And I type "Verify pause and resume." in "goal objective" element with selector "[role='dialog'] textarea:not([readonly])"
    And I click on a "start goal" element with selector "[role='dialog'] button:has-text('开始目标')"
    Then I should see a "streaming goal reply" element with selector "[data-testid='message-bubble']:has-text('GOAL_PAUSE_PROGRESS')"
    When I click on a "pause goal" element with selector "[role='dialog'] button:has-text('暂停')"
    Then I should see a "paused goal" element with selector "[role='dialog'] .MuiChip-label:has-text('已暂停')"
    When I click on a "return to conversation" element with selector "[role='dialog'] button:has-text('返回')"
    And I reload the current window
    And I click on a "goal button" element with selector "button:has-text('目标')"
    Then I should see a "restored paused goal" element with selector "[role='dialog'] .MuiChip-label:has-text('已暂停')"
    When I click on a "resume goal" element with selector "[role='dialog'] button:has-text('继续')"
    Then I should see a "resumed completion evidence" element with selector "[role='dialog'] p:has-text('GOAL_RESUMED_EVIDENCE')"
    When I click on a "return to conversation" element with selector "[role='dialog'] button:has-text('返回')"
    Then I should see a "resumed final reply" element with selector "[data-testid='message-bubble']:has-text('GOAL_RESUMED_RESULT')"

  @agent @mockOpenAI @agentGoal @scheduled-execution
  Scenario: A scheduled message executes through the durable model runtime
    Given I add mock OpenAI responses:
      | response | stream | embedding | toolName | toolArguments |
      | SCHEDULE_ACCEPTANCE_RESULT | false | | | |
    When I schedule a one-shot message for the current test conversation
    Then I should see a "scheduled user message" element with selector "[data-testid='message-bubble']:has-text('SCHEDULE_ACCEPTANCE_REQUEST')"
    And I should see a "scheduled final reply" element with selector "[data-testid='message-bubble']:has-text('SCHEDULE_ACCEPTANCE_RESULT')"
    When I reload the current window
    Then I should see a "restored scheduled result" element with selector "[data-testid='message-bubble']:has-text('SCHEDULE_ACCEPTANCE_RESULT')"
