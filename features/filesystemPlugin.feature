Feature: Filesystem Plugin
  As a user
  I want tiddlers with specific tags to be saved to sub-wikis automatically
  So that I can organize content across wikis

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable file system watch for testing (default is false in production)
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready

  @file-watching
  Scenario: External file creation syncs to wiki
    # Create a test tiddler file directly on filesystem
    When I create file "{tmpDir}/wiki/tiddlers/WatchTestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: WatchTestTiddler
      
      Initial content from filesystem
      """
    # Wait for watch-fs to detect and add the tiddler
    Then I wait for tiddler "WatchTestTiddler" to be added by watch-fs
    # Open the tiddler directly
    When I open tiddler "WatchTestTiddler" in browser view
    # Verify the tiddler content is displayed
    Then I should see "Initial content from filesystem" in the browser view content

  @file-watching
  Scenario: External file modification and deletion sync to wiki
    # Create initial file
    When I create file "{tmpDir}/wiki/tiddlers/TestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: TestTiddler
      
      Original content
      """
    Then I wait for tiddler "TestTiddler" to be added by watch-fs
    # Open the tiddler directly
    When I open tiddler "TestTiddler" in browser view
    Then I should see "Original content" in the browser view content
    # Modify the file externally
    When I modify file "{tmpDir}/wiki/tiddlers/TestTiddler.tid" to contain "Modified content from external editor"
    Then I wait for tiddler "TestTiddler" to be updated by watch-fs
    # Verify the wiki shows updated content (should auto-refresh), the content check will wait for it
    Then I should see "Modified content from external editor" in the browser view content
    # Now delete the file externally
    When I delete file "{tmpDir}/wiki/tiddlers/TestTiddler.tid"
    Then I wait for tiddler "TestTiddler" to be deleted by watch-fs
    # The tiddler should show missing message
    Then I should see "佚失条目" in the browser view content

  @file-watching
  Scenario: Deleting open tiddler file shows missing tiddler message
    # Delete the Index.tid file while Index tiddler is open (it's open by default)
    When I delete file "{tmpDir}/wiki/tiddlers/Index.tid"
    Then I wait for tiddler "Index" to be deleted by watch-fs
    # Verify the missing tiddler message appears in the tiddler frame
    Then I should see "佚失条目 \"Index\"" in the browser view DOM

  @file-watching
  Scenario: External file rename syncs to wiki
    # Create initial file
    When I create file "{tmpDir}/wiki/tiddlers/OldName.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: OldName
      
      Content before rename
      """
    Then I wait for tiddler "OldName" to be added by watch-fs
    # Open the tiddler directly
    When I open tiddler "OldName" in browser view
    # Content check will automatically wait
    Then I should see "Content before rename" in the browser view content
    # Rename the file externally
    When I rename file "{tmpDir}/wiki/tiddlers/OldName.tid" to "{tmpDir}/wiki/tiddlers/NewName.tid"
    # Update the title field in the renamed file to match the new filename
    And I modify file "{tmpDir}/wiki/tiddlers/NewName.tid" to contain:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: NewName
      
      Content before rename
      """
    # Wait for the new tiddler to be detected and synced
    Then I wait for tiddler "NewName" to be updated by watch-fs
    # Open the renamed tiddler directly
    When I open tiddler "NewName" in browser view
    # Content check will automatically wait
    Then I should see "Content before rename" in the browser view content

  @file-watching
  Scenario: External field modification syncs to wiki
    # Modify an existing tiddler file by adding a tags field to TiddlyWikiIconBlue.png
    When I modify file "{tmpDir}/wiki/tiddlers/TiddlyWikiIconBlue.png.tid" to add field "tags: TestTag"
    Then I wait for tiddler "TiddlyWikiIconBlue.png" to be updated by watch-fs
    # Open the tiddler directly to verify the tag was added
    When I open tiddler "TiddlyWikiIconBlue.png" in browser view
    # Element check will automatically wait for the tag to appear
    Then I should see a "TestTag tag" element in browser view with selector "[data-tiddler-title='TiddlyWikiIconBlue.png'] [data-tag-title='TestTag']"
    # Now modify Index.tid by adding a tags field
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to add field "tags: AnotherTag"
    Then I wait for tiddler "Index" to be updated by watch-fs
    # Index is displayed by default, element check will automatically wait
    Then I should see a "AnotherTag tag" element in browser view with selector "[data-tiddler-title='Index'] [data-tag-title='AnotherTag']"
    # Modify favicon.ico.meta file by adding a tags field
    When I modify file "{tmpDir}/wiki/tiddlers/favicon.ico.meta" to add field "tags: IconTag"
    Then I wait for tiddler "favicon.ico" to be updated by watch-fs
    # Open the favicon.ico tiddler directly
    When I open tiddler "favicon.ico" in browser view
    # Element check will automatically wait for the tag to appear
    Then I should see a "IconTag tag" element in browser view with selector "[data-tiddler-title='favicon.ico'] [data-tag-title='IconTag']"
