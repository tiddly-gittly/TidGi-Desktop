Feature: Git Sync
  As a user
  I want to sync my wiki to a remote repository
  So that I can backup and share my content

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable file system watch and HTTP API (for mobile sync) together
    When I update workspace "wiki" settings:
      | property              | value |
      | enableFileSystemWatch | true  |
      | enableHTTPAPI         | true  |
      | port                  | 15212 |
    Then the browser view should be loaded and visible
    And I wait for SSE and watch-fs to be ready
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"

  @git @sync @mobilesync
  Scenario: Desktop cloud sync and mobile HTTP sync cover commit-push, diverged merge, and mobile conflict resolution
    # ══════════════════════════════════════════════════════════════════
    # Part 1: Sync to local remote via application menu (commit & push)
    # ══════════════════════════════════════════════════════════════════
    When I create a bare git repository at "{tmpDir}/remote-repo-menu.git"
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on "saveAndSyncOptions accordion and syncToCloud toggle" elements with selectors:
      | element description         | selector                                              |
      | saveAndSyncOptions accordion| [data-testid='preference-section-saveAndSyncOptions'] |
      | syncToCloud toggle          | [data-testid='synced-local-workspace-switch']         |
    When I type in "git url input and github username input and github email input and github token input" elements with selectors:
      | text                              | selector                                                                                                                                                     |
      | {tmpDir}/remote-repo-menu.git     | label:has-text('Git仓库线上网址') + * input, label:has-text('Git Repo URL') + * input, input[aria-label='Git仓库线上网址'], input[aria-label='Git Repo URL'] |
      | testuser                          | [data-testid='github-userName-input'] input                                                                                                                  |
      | testuser@example.com              | [data-testid='github-email-input'] input                                                                                                                     |
      | test-token-12345                  | [data-testid='github-token-input'] input                                                                                                                     |
    When I click on a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    When I switch to "main" window
    When I create file "{tmpDir}/wiki/tiddlers/SyncMenuTestTiddler.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: SyncMenuTestTiddler
      tags: SyncTest
      
      This is a test tiddler for sync via menu feature.
      """
    Then I wait for tiddler "SyncMenuTestTiddler" to be added by watch-fs
    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    Then the remote repository "{tmpDir}/remote-repo-menu.git" should contain commit with message "使用太记桌面版备份"
    And the remote repository "{tmpDir}/remote-repo-menu.git" should contain file "tiddlers/SyncMenuTestTiddler.tid"

    # ══════════════════════════════════════════════════════════════════
    # Part 2: Diverged histories — auto-merge & same-line conflict
    # ══════════════════════════════════════════════════════════════════
    # Switch remote URL for diverged-history testing
    When I create a bare git repository at "{tmpDir}/remote-diverge.git"
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I type in "git url input" elements with selectors:
      | text                              | selector                                                                                                                                                     |
      | {tmpDir}/remote-diverge.git       | label:has-text('Git仓库线上网址') + * input, label:has-text('Git Repo URL') + * input, input[aria-label='Git仓库线上网址'], input[aria-label='Git Repo URL'] |
    When I click on a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    When I switch to "main" window

    # Part 2A: Append conflict (different lines) → auto-merge
    When I create file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: AppendDoc
      tags: Shared

      Line one from initial commit.


      Line three placeholder.
      """
    Then I wait for tiddler "AppendDoc" to be added by watch-fs
    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"

    When I push a commit to bare repository "{tmpDir}/remote-diverge.git" adding file "tiddlers/AppendDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: AppendDoc
      tags: Shared

      Line one from initial commit.


      Line three placeholder.
      Appended from external.
      """

    When I create file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: AppendDoc
      tags: Shared

      Line one from initial commit.
      Inserted from desktop.

      Line three placeholder.
      """
    Then I wait for tiddler "AppendDoc" to be updated by watch-fs

    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    Then file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" should contain text "Appended from external."
    And file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" should contain text "Inserted from desktop."
    And file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" should not contain text "<<<<<<< HEAD"

    # Part 2B: Same-line edit conflict → conflict markers committed
    When I create file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: ConflictDoc
      tags: Conflict

      Original line that will be edited.
      """
    Then I wait for tiddler "ConflictDoc" to be added by watch-fs
    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"

    When I push a commit to bare repository "{tmpDir}/remote-diverge.git" adding file "tiddlers/ConflictDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226110000000
      title: ConflictDoc
      tags: Conflict

      External edited this line.
      """

    When I create file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226120000000
      title: ConflictDoc
      tags: Conflict

      Desktop edited this line.
      """
    Then I wait for tiddler "ConflictDoc" to be updated by watch-fs

    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    Then file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" should contain text "External edited this line."
    And file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" should contain text "Desktop edited this line."

    # ══════════════════════════════════════════════════════════════════
    # Part 3: Mobile HTTP git sync — fast-forward, merge, conflict
    # ══════════════════════════════════════════════════════════════════
    # Part 3A: Fast-forward push
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone"
    When I create file "{tmpDir}/mobile-clone/tiddlers/MobileNote.tid" with content:
      """
      created: 20250226100000000
      modified: 20250226100000000
      title: MobileNote
      tags: Mobile

      Written on mobile phone.
      """
    When I sync "{tmpDir}/mobile-clone" via HTTP to workspace "wiki"
    Then file "{tmpDir}/wiki/tiddlers/MobileNote.tid" should contain text "Written on mobile phone."

    # Part 3B: Non-overlapping merge with uncommitted desktop changes
    When I create a tiddler "DesktopOnly" with tag "Desktop" in browser view
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone2"
    When I create a tiddler "DesktopNew" with tag "Desktop" in browser view
    When I create file "{tmpDir}/mobile-clone2/tiddlers/MobileNew.tid" with content:
      """
      created: 20250226120000000
      modified: 20250226120000000
      title: MobileNew
      tags: Mobile

      Mobile created this tiddler.
      """
    When I sync "{tmpDir}/mobile-clone2" via HTTP to workspace "wiki"
    Then file "{tmpDir}/wiki/tiddlers/MobileNew.tid" should contain text "Mobile created this tiddler."
    And file "{tmpDir}/wiki/tiddlers/DesktopNew.tid" should contain text "Desktop"

    # Part 3C: Same-name tiddler conflict — mobile metadata wins
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone3"
    When I create file "{tmpDir}/wiki/tiddlers/SharedNote.tid" with content:
      """
      created: 20250226100000000
      modified: 20250226100500000
      title: SharedNote
      tags: Desktop

      Written on desktop.
      """
    When I create file "{tmpDir}/mobile-clone3/tiddlers/SharedNote.tid" with content:
      """
      created: 20250226100000000
      modified: 20250226110000000
      title: SharedNote
      tags: Mobile

      Written on mobile.
      """
    When I sync "{tmpDir}/mobile-clone3" via HTTP to workspace "wiki"
    Then file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "tags: Mobile"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "modified: 20250226110000000"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "Written on mobile."
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should not contain text "<<<<<<<"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should not contain text "======="

    # Part 3D: Both sides edit existing tiddler — body merged, metadata from mobile
    When I create file "{tmpDir}/wiki/tiddlers/Journal.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: Journal
      tags: Original

      Line one from original.
      Line two from original.
      """
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone4"
    When I create file "{tmpDir}/wiki/tiddlers/Journal.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226100500000
      title: Journal
      tags: Original

      Line one from original.
      Line two from original.
      Desktop added this line.
      """
    When I create file "{tmpDir}/mobile-clone4/tiddlers/Journal.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226110000000
      title: Journal
      tags: Original

      Line one from original.
      Line two from original.
      Mobile added this line.
      """
    When I sync "{tmpDir}/mobile-clone4" via HTTP to workspace "wiki"
    Then file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "modified: 20250226110000000"
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Mobile added this line."
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Desktop added this line."
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Line one from original."
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should not contain text "<<<<<<<"
