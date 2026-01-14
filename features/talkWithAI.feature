Feature: Talk with AI from Wiki Selection
  As a user
  I want to select text in wiki and talk with AI about it
  So that I can get AI-powered explanations in a split view

  Background:
    Given I add test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"

  @talkWithAI @mockOpenAI
  Scenario: Talk with AI - complete workflow
    Given I have started the mock OpenAI server
      | response                                                                       | stream |
      | 这段文字说明了如何编辑卡片，点击右上角的按钮可以开始编辑当前卡片。 | false  |
      | 第一条消息：这是关于编辑的说明。                                        | false  |
      | 第二条消息：这是关于访问教程的补充说明。                            | false  |
      | 第三条消息：这是第一个对话的回复。                                      | false  |
    
    # Part 1: Create new split view from wiki selection
    When I click on a "wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Wait for agent workspace to be created and activate it to ensure React components are mounted
    Then I should see a "agent workspace button" element with selector "[data-testid='workspace-agent']"
    When I click on "agent workspace button and wiki workspace button" elements with selectors:
      | element description     | selector                                            |
      | agent workspace button  | [data-testid='workspace-agent']                     |
      | wiki workspace button   | div[data-testid^='workspace-']:has-text('wiki')     |
    # Trigger "Talk with AI" - should create new split view
    When I send ask AI with selection message with text "Click button on top-right of this card to start edit." and workspace "wiki"
    Then I should see "split view container and wiki embed and chat input" elements with selectors:
      | element description     | selector                                |
      | split view container    | [data-testid='split-view-container']    |
      | wiki embed              | [data-testid='wiki-embed-view']         |
      | chat input              | [data-testid='agent-message-input']     |
    And I confirm the "main" window browser view is positioned within visible window bounds
    And I should see 2 messages in chat history
    
    # Part 2: Reuse active split view - messages should accumulate (not reset)
    When I send ask AI with selection message with text "How to edit?" and workspace "wiki"
    Then I should see "split view container with 4 messages" elements with selectors:
      | element description              | selector                             |
      | split view container with 4 messages| [data-testid='split-view-container'] |
    # Should see 4 messages now (2 from part 1 + 2 new ones) - proves tab was reused
    And I should see 4 messages in chat history
    
    # Part 3: Create new tab when starting from regular chat
    When I click on a "agent workspace button" element with selector "[data-testid='workspace-agent']"
    When I click on "new tab button and search input and agent suggestion" elements with selectors:
      | element description | selector                                                      |
      | new tab button      | [data-tab-id='new-tab-button']                                |
      | search input        | .aa-Input                                                     |
      | agent suggestion    | [data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper |
    When I send ask AI with selection message with text "First question" and workspace "wiki"
    Then I should see a "split view container" element with selector "[data-testid='split-view-container']"
    # Should see only 2 messages (new tab was created, not reused)
    And I should see 2 messages in chat history
    
    # Part 4: Verify split view doesn't interfere with regular chat
    # Create another regular chat tab
    When I click on "new tab button and search input and agent suggestion" elements with selectors:
      | element description | selector                                                      |
      | new tab button      | [data-tab-id='new-tab-button']                                |
      | search input        | .aa-Input                                                     |
      | agent suggestion    | [data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper |
    # Now in regular chat tab - split view and browser view should not be visible
    Then I should not see a "split view container" element with selector "[data-testid='split-view-container']"
    And I confirm the "main" window browser view is not positioned within visible window bounds
    # Switch to wiki workspace - browser view should exist for wiki
    When I click on a "wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then I confirm the "main" window browser view is positioned within visible window bounds

