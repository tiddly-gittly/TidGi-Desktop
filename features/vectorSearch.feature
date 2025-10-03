Feature: Vector Search - Embedding Generation and Semantic Search
  As a user
  I want to use vector database to perform semantic search in my wiki
  So that I can find relevant content based on meaning rather than exact keywords

  Background:
    Given I add test ai settings
    Then I launch the TidGi application
    And I wait for the page to load completely
    And I should see a "page body" element with selector "body"
    # Ensure we are in the agent workspace (not wiki workspace) for agent interaction
    When I click on an "agent workspace button" element with selector "[data-testid='workspace-agent']"
    And I should see a "new tab button" element with selector "[data-tab-id='new-tab-button']"

  @vectorSearch @mockOpenAI
  Scenario: Agent workflow - Create notes, update embeddings, then search
    Given I have started the mock OpenAI server
      | response                                                                                                                                                                                                        | stream | embedding   |
      | <tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"AI Agent Guide","text":"智能体是一种可以执行任务的AI系统，它可以使用工具、搜索信息并与用户交互。"}</tool_use>   | false  |             |
      | 已成功在工作区 wiki 中创建条目 "AI Agent Guide"。                                                                                                                                                               | false  |             |
      | <tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"Vector Database Tutorial","text":"向量数据库用于存储和检索高维向量数据，支持语义搜索和相似度匹配。"}</tool_use> | false  |             |
      | 已成功在工作区 wiki 中创建条目 "Vector Database Tutorial"。                                                                                                                                                     | false  |             |
      | <tool_use name="wiki-update-embeddings">{"workspaceName":"wiki","forceUpdate":false}</tool_use>                                                                                                                 | false  |             |
      |                                                                                                                                                                                                                 | false  | note1       |
      |                                                                                                                                                                                                                 | false  | note2       |
      | 已成功为工作区 wiki 生成向量嵌入索引。总计2个笔记，2个嵌入向量。                                                                                                                                                | false  |             |
      | <tool_use name="wiki-search">{"workspaceName":"wiki","searchType":"vector","query":"如何使用AI智能体","limit":5,"threshold":0.7}</tool_use>                                                                     | false  |             |
      |                                                                                                                                                                                                                 | false  | query-note1 |
      | 根据向量搜索结果，在工作区 wiki 中找到以下相关内容：\n\n**Tiddler: AI Agent Guide** (Similarity: 95.0%)\n这篇笔记介绍了AI智能体的基本概念和使用方法。                                                           | false  |             |
    # Step 1: Open agent chat interface
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    And I should see a "search interface" element with selector ".aa-Autocomplete"
    When I click on a "search input box" element with selector ".aa-Input"
    And I should see an "autocomplete panel" element with selector ".aa-Panel"
    When I click on an "agent suggestion" element with selector '[data-autocomplete-source-id="agentsSource"] .aa-ItemWrapper'
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Step 2: Create first note
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "在 wiki 工作区创建一个名为 AI Agent Guide 的笔记，内容是：智能体是一种可以执行任务的AI系统，它可以使用工具、搜索信息并与用户交互。" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    Then I should see 4 messages in chat history
    # Step 3: Create second note
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "再创建一个名为 Vector Database Tutorial 的笔记，内容是：向量数据库用于存储和检索高维向量数据，支持语义搜索和相似度匹配。" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    Then I should see 8 messages in chat history
    # Step 4: Update vector embeddings using agent tool
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "为 wiki 工作区更新向量索引" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 2 seconds
    Then I should see 12 messages in chat history
    # Step 5: Perform vector search
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "使用向量搜索在 wiki 中查找关于如何使用AI智能体的内容" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    Then I should see 16 messages in chat history
    # Verify the last message contains vector search results
    And I should see a "search result in last message" element with selector "[data-testid='message-bubble']:last-child:has-text('Tiddler: AI Agent Guide')"

  @vectorSearch @mockOpenAI
  Scenario: UI workflow - Generate embeddings via preferences, then search
    Given I have started the mock OpenAI server
      | response                                                                                                                                                                                                       | stream | embedding   |
      | <tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"Machine Learning Basics","text":"机器学习是人工智能的一个分支，通过算法让计算机从数据中学习规律。"}</tool_use> | false  |             |
      | 已成功在工作区 wiki 中创建条目 "Machine Learning Basics"。                                                                                                                                                     | false  |             |
      |                                                                                                                                                                                                                | false  | note3       |
      | <tool_use name="wiki-search">{"workspaceName":"wiki","searchType":"vector","query":"机器学习","limit":5,"threshold":0.7}</tool_use>                                                                            | false  |             |
      |                                                                                                                                                                                                                | false  | query-note3 |
      | 根据向量搜索结果，在工作区 wiki 中找到以下相关内容：\n\n**Tiddler: Machine Learning Basics** (Similarity: 98.0%)\n这篇笔记介绍了机器学习的基本概念。                                                           | false  |             |
    # Step 1: Create a test note via agent
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "在 wiki 工作区创建一个名为 Machine Learning Basics 的笔记，内容是：机器学习是人工智能的一个分支，通过算法让计算机从数据中学习规律。" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    Then I should see 4 messages in chat history
    # Step 2: Open preferences and manually generate embeddings via UI
    When I click on a "settings button" element with selector "#open-preferences-button"
    And I wait for 0.3 seconds
    When I switch to "preferences" window
    # Navigate to Search section (which contains vector database settings)
    When I click on a "search section" element with selector "[data-testid='preference-section-search']"
    And I wait for 0.2 seconds
    # Wait for workspace list to load
    # The Search.tsx renders workspace cards with name, status, and buttons
    And I should see a "wiki workspace card" element with selector "*:has-text('wiki')"
    # Click the generate button - use button text "生成" instead of data-testid
    # The button shows "生成" for initial generation, "更新嵌入" after generation
    When I click on a "generate button with text" element with selector "button:has-text('生成')"
    And I wait for 0.5 seconds
    # Verify generation completed with detailed status information
    # Should show: workspace name, embedding count, note count, last updated time
    And I should see a "workspace name in status" element with selector "*:has-text('wiki')"
    # Verify the status text format: "X个笔记的X个嵌入" (e.g., "1个笔记的1个嵌入")
    And I should see a "embedding count status" element with selector "*:has-text('个笔记')"
    And I should see a "embedding word" element with selector "*:has-text('嵌入')"
    # Verify last updated timestamp is shown
    And I should see a "last updated label" element with selector "*:has-text('最后更新')"
    # Verify "更新嵌入" button appears after generation (replaces "生成")
    And I should see a "update button after generation" element with selector "button:has-text('更新嵌入')"
    # Verify "删除" button appears after generation
    And I should see a "delete button after generation" element with selector "button:has-text('删除')"
    # Close preferences
    When I close "preferences" window
    And I wait for 0.2 seconds
    And I switch to "main" window
    And I wait for 0.2 seconds
    # Step 3: Perform vector search and verify results match agent workflow
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "使用向量搜索在 wiki 中查找关于机器学习的内容" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    Then I should see 8 messages in chat history
    # Verify the last message contains vector search results
    And I should see a "ML search result in last message" element with selector "[data-testid='message-bubble']:last-child:has-text('Tiddler: Machine Learning Basics')"

  @vectorSearch @mockOpenAI
  Scenario: Vector search with low similarity - No results below threshold, then lower threshold
    Given I have started the mock OpenAI server
      | response                                                                                                                                                       | stream | embedding |
      | <tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"AI Technology","text":"人工智能技术正在改变世界。"}</tool_use> | false  |           |
      | 已成功在工作区 wiki 中创建条目 "AI Technology"。                                                                                                               | false  |           |
      | <tool_use name="wiki-operation">{"workspaceName":"wiki","operation":"wiki-add-tiddler","title":"Machine Learning","text":"机器学习算法和应用。"}</tool_use>   | false  |           |
      | 已成功在工作区 wiki 中创建条目 "Machine Learning"。                                                                                                            | false  |           |
      | <tool_use name="wiki-update-embeddings">{"workspaceName":"wiki","forceUpdate":false}</tool_use>                                                                | false  |           |
      |                                                                                                                                                                | false  | note4     |
      |                                                                                                                                                                | false  | note5     |
      | 已成功为工作区 wiki 生成向量嵌入索引。总计2个笔记，2个嵌入向量。                                                                                               | false  |           |
      | <tool_use name="wiki-search">{"workspaceName":"wiki","searchType":"vector","query":"天气预报","limit":5,"threshold":0.7}</tool_use>                            | false  |           |
      |                                                                                                                                                                | false  | unrelated |
      | 在Wiki工作空间"wiki"中未找到符合条件的向量搜索结果（相似度阈值：0.7）。                                                                                        | false  |           |
      | <tool_use name="wiki-search">{"workspaceName":"wiki","searchType":"vector","query":"天气预报","limit":5,"threshold":0.1}</tool_use>                            | false  |           |
      |                                                                                                                                                                | false  | unrelated |
      | 根据向量搜索结果，在工作区 wiki 中找到以下相关内容：\n\n**Tiddler: AI Technology** (Similarity: 15.0%)\n低相似度结果。                                           | false  |           |
    # Step 1: Open agent chat interface
    When I click on a "new tab button" element with selector "[data-tab-id='new-tab-button']"
    When I click on a "create default agent button" element with selector "[data-testid='create-default-agent-button']"
    And I should see a "message input box" element with selector "[data-testid='agent-message-input']"
    # Step 2: Create first note about AI
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "在 wiki 工作区创建一个名为 AI Technology 的笔记，内容是：人工智能技术正在改变世界。" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 0.5 seconds
    Then I should see 4 messages in chat history
    
    # Step 3: Create second note about ML
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "再创建一个名为 Machine Learning 的笔记，内容是：机器学习算法和应用。" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 0.5 seconds
    Then I should see 8 messages in chat history
    
    # Step 4: Update vector embeddings
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "为 wiki 工作区更新向量索引" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 2 seconds
    Then I should see 12 messages in chat history
    
    # Step 5: Search for unrelated content with high threshold (should find nothing)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "使用向量搜索在 wiki 中查找关于天气预报的内容，阈值设为0.7" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 0.5 seconds
    Then I should see 16 messages in chat history
    # Verify the 16th message contains "no results found" with threshold info
    And I should see a "no results in 16th message" element with selector "[data-testid='message-bubble']:nth-child(16):has-text('未找到符合条件')"
    And I should see a "threshold 0.7 in 16th message" element with selector "[data-testid='message-bubble']:nth-child(16):has-text('0.7')"
    
    # Step 6: Lower threshold and search again (should find low-similarity results)
    When I click on a "message input textarea" element with selector "[data-testid='agent-message-input']"
    When I type "再次搜索天气预报，但这次把阈值降低到0.1" in "chat input" element with selector "[data-testid='agent-message-input']"
    And I press "Enter" key
    And I wait for 1 seconds
    Then I should see 20 messages in chat history
    # Verify the 20th message contains low-similarity result
    And I should see a "AI Technology in 20th message" element with selector "[data-testid='message-bubble']:nth-child(20):has-text('Tiddler: AI Technology')"
    And I should see a "low similarity in 20th message" element with selector "[data-testid='message-bubble']:nth-child(20):has-text('15')"
