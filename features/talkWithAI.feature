Feature: Talk with AI from Wiki Selection
  As a user
  I want to select text in wiki and talk with AI about it
  So that I can get AI-powered explanations in a split view

  Background:
    Given I add test ai settings

  @talkWithAI @mockOpenAI
  Scenario: Talk with AI - complete workflow
    Given I have started the mock OpenAI server
      | response                                                                       | stream |
      | 这段文字说明了如何编辑卡片，点击右上角的按钮可以开始编辑当前卡片。 | false  |
      | 第一条消息：这是关于编辑的说明。                                        | false  |
      | 第二条消息：这是关于访问教程的补充说明。                            | false  |
      | 第三条消息：这是第一个对话的回复。                                      | false  |
    # Launch application after mock server is ready
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    
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
    And I wait for 1 seconds for "browser view repositioning after workspace switch"
    Then I confirm the "main" window browser view is positioned within visible window bounds


  @agent @mockOpenAI
  Scenario: Wiki tiddler attachment with rendered content
    # Start mock server and launch app (not in Background for this feature)
    Given I have started the mock OpenAI server
      | response                                                                                                    | stream |
      | 我收到了你发送的 wiki 条目内容。                                                                            | false  |
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # First, navigate to wiki workspace and create a test tiddler with wikitext content
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for "SSE backend ready" log marker "[test-id-SSE_READY]"
    # Create a new tiddler with wikitext syntax
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler({title: 'TestAttachmentTiddler', text: '!!WikiTestHeader\\n\\nThis is a test with WikiTestContentMarker123', type: 'text/vnd.tiddlywiki'}))"
    # Navigate to agent workspace and create agent
    When I click on "agent workspace button and create default agent button" elements with selectors:
      | element description         | selector                                    |
      | agent workspace button      | [data-testid='workspace-agent']             |
      | create default agent button | [data-testid='create-default-agent-button'] |
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Click attachment button to open autocomplete
    When I click on a "attach button" element with selector "[data-testid='agent-attach-button']"
    # Autocomplete should open showing image option + tiddler options
    And I should see a "attachment autocomplete input" element with selector "[data-testid='attachment-autocomplete-input']"
    And I should see a "attachment listbox" element with selector "[data-testid='attachment-listbox']"
    # Click on our test tiddler option
    When I click on a "test tiddler option" element with selector "[data-testid='attachment-option-tiddler-TestAttachmentTiddler']"
    # Verify the chip is displayed
    Then I should see a "wiki tiddler chip" element with selector "[data-testid='wiki-tiddler-chip-0']"
    # Type message and send
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "请分析这个条目" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    # Verify the mock server received the rendered content (wikitext converted to plain text)
    Then the last AI request user message should contain "WikiTestContentMarker123"
    And the last AI request user message should contain "Wiki Entry from"
    And the last AI request user message should contain "TestAttachmentTiddler"
    # Verify wikitext was converted to plain text (!! becomes "Header", not raw !!)
    And the last AI request user message should contain "WikiTestHeader"
    And the last AI request user message should not contain "!!"


  @agent @mockOpenAI @streamingStatus @imageUpload
  Scenario: Image upload streaming status and history verification
    # Start mock server and launch app
    Given I have started the mock OpenAI server
      | response                      | stream |
      | Received image and text       | false  |
      | Received second message       | false  |
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Navigate to agent workspace and open agent chat
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    
    # Click attachment button to open autocomplete
    When I click on a "attach button" element with selector "[data-testid='agent-attach-button']"
    # Wait for autocomplete to open
    And I should see a "attachment autocomplete input" element with selector "[data-testid='attachment-autocomplete-input']"
    # Register Playwright filechooser intercept BEFORE clicking Add Image so the
    # native OS dialog never appears; the chooser is resolved directly with the file.
    When I prepare to select file "template/wiki/files/TiddlyWikiIconBlack.png" for file chooser
    # Click on "Add Image" option — triggers fileInput.click() which fires filechooser
    When I click on a "add image option" element with selector "[data-testid='attachment-option-image-AddImage']"
    # Verify image preview appears
    Then I should see an "attachment preview" element with selector "[data-testid='attachment-preview']"
    
    # Send message with image
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "Describe this image" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 2 messages in chat history
    
    # Verify image appears in chat history
    And I should see a "message image attachment" element with selector "[data-testid='message-image-attachment']"
    
    # Verify send button returned to normal after first message
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
    
    # Send second message to check history includes image
    When I type "Continue" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    Then I should see 4 messages in chat history
    
    # Verify send button is still normal after second message
    And I should see a "send button icon" element with selector "[data-testid='send-icon']"
    And I should not see a "cancel button icon" element with selector "[data-testid='cancel-icon']"
