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
  Scenario: File lifecycle - create, modify, rename, field-edit, and delete syncs to wiki
    # --- Part 1: External file creation ---
    When I create file "{tmpDir}/wiki/tiddlers/WatchTestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: WatchTestTiddler
      
      Initial content from filesystem
      """
    Then I wait for tiddler "WatchTestTiddler" to be added by watch-fs
    When I open tiddler "WatchTestTiddler" in browser view
    Then I should see "Initial content from filesystem" in the browser view content

    # --- Part 2: External file rename ---
    When I create file "{tmpDir}/wiki/tiddlers/OldName.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: OldName
      
      Content before rename
      """
    Then I wait for tiddler "OldName" to be added by watch-fs
    When I open tiddler "OldName" in browser view
    Then I should see "Content before rename" in the browser view content
    When I rename file "{tmpDir}/wiki/tiddlers/OldName.tid" to "{tmpDir}/wiki/tiddlers/NewName.tid"
    And I modify file "{tmpDir}/wiki/tiddlers/NewName.tid" to contain:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: NewName
      
      Content before rename
      """
    Then I wait for tiddler "NewName" to be updated by watch-fs
    When I open tiddler "NewName" in browser view
    Then I should see "Content before rename" in the browser view content

    # --- Part 3: External field modification ---
    When I modify file "{tmpDir}/wiki/tiddlers/TiddlyWikiIconBlue.png.tid" to add field "tags: TestTag"
    Then I wait for tiddler "TiddlyWikiIconBlue.png" to be updated by watch-fs
    When I open tiddler "TiddlyWikiIconBlue.png" in browser view
    Then I should see a "TestTag tag" element in browser view with selector "[data-tiddler-title='TiddlyWikiIconBlue.png'] [data-tag-title='TestTag']"
    When I modify file "{tmpDir}/wiki/tiddlers/Index.tid" to add field "tags: AnotherTag"
    Then I wait for tiddler "Index" to be updated by watch-fs
    Then I should see a "AnotherTag tag" element in browser view with selector "[data-tiddler-title='Index'] [data-tag-title='AnotherTag']"
    When I modify file "{tmpDir}/wiki/tiddlers/favicon.ico.meta" to add field "tags: IconTag"
    Then I wait for tiddler "favicon.ico" to be updated by watch-fs
    When I open tiddler "favicon.ico" in browser view
    Then I should see a "IconTag tag" element in browser view with selector "[data-tiddler-title='favicon.ico'] [data-tag-title='IconTag']"

    # --- Part 4: External file modification and deletion ---
    When I create file "{tmpDir}/wiki/tiddlers/TestTiddler.tid" with content:
      """
      created: 20250226070000000
      modified: 20250226070000000
      title: TestTiddler
      
      Original content
      """
    Then I wait for tiddler "TestTiddler" to be added by watch-fs
    When I open tiddler "TestTiddler" in browser view
    Then I should see "Original content" in the browser view content
    When I modify file "{tmpDir}/wiki/tiddlers/TestTiddler.tid" to contain "Modified content from external editor"
    Then I wait for tiddler "TestTiddler" to be updated by watch-fs
    Then I should see "Modified content from external editor" in the browser view content
    When I delete file "{tmpDir}/wiki/tiddlers/TestTiddler.tid"
    Then I wait for tiddler "TestTiddler" to be deleted by watch-fs
    Then I should see "佚失条目" in the browser view content

    # --- Part 5: Deleting open tiddler (must be last since it destroys Index.tid) ---
    When I delete file "{tmpDir}/wiki/tiddlers/Index.tid"
    Then I wait for tiddler "Index" to be deleted by watch-fs
    Then I should see "佚失条目 \"Index\"" in the browser view DOM
