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

  @git @sync
  Scenario: Sync to local remote repository via application menu (commit and push)
    # Setup a bare git repository as local remote
    When I create a bare git repository at "{tmpDir}/remote-repo-menu.git"
    # Configure sync via edit workspace window
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
    # Workspace update triggers a restart, need to wait for it to complete before continuing
    Then I should not see a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    When I switch to "main" window
    # Create a new tiddler to trigger sync
    When I create file "{tmpDir}/wiki/tiddlers/SyncMenuTestTiddler.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: SyncMenuTestTiddler
      tags: SyncTest
      
      This is a test tiddler for sync via menu feature.
      """
    Then I wait for tiddler "SyncMenuTestTiddler" to be added by watch-fs
    # Clear previous test markers to ensure we're testing fresh sync operation
    When I clear test-id markers from logs
    # Use application menu to sync (commit and push)
    When I click menu "知识库 > 立即同步云端"
    # Wait for git sync to complete (not just commit)
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    # Verify the commit was pushed to remote by cloning the remote and checking
    Then the remote repository "{tmpDir}/remote-repo-menu.git" should contain commit with message "使用太记桌面版备份"
    And the remote repository "{tmpDir}/remote-repo-menu.git" should contain file "tiddlers/SyncMenuTestTiddler.tid"

  @git @sync
  Scenario: Resolve diverged histories during cloud sync (append auto-merge and same-line conflict)
    # Setup bare repo as cloud remote and configure sync
    When I create a bare git repository at "{tmpDir}/remote-diverge.git"
    When I open edit workspace window for workspace with name "wiki"
    And I switch to "editWorkspace" window
    And I wait for the page to load completely
    When I click on "saveAndSyncOptions accordion and syncToCloud toggle" elements with selectors:
      | element description         | selector                                              |
      | saveAndSyncOptions accordion| [data-testid='preference-section-saveAndSyncOptions'] |
      | syncToCloud toggle          | [data-testid='synced-local-workspace-switch']         |
    When I type in "git url input and github username input and github email input and github token input" elements with selectors:
      | text                              | selector                                                                                                                                                     |
      | {tmpDir}/remote-diverge.git       | label:has-text('Git仓库线上网址') + * input, label:has-text('Git Repo URL') + * input, input[aria-label='Git仓库线上网址'], input[aria-label='Git Repo URL'] |
      | testuser                          | [data-testid='github-userName-input'] input                                                                                                                  |
      | testuser@example.com              | [data-testid='github-email-input'] input                                                                                                                     |
      | test-token-12345                  | [data-testid='github-token-input'] input                                                                                                                     |
    When I click on a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    Then I should not see a "save workspace button" element with selector "[data-testid='edit-workspace-save-button']"
    When I switch to "main" window

    # ══ Part A: Append conflict (different lines) → auto-merge ══
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

    # Simulated external push appends after line three - metadata stays same
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

    # Desktop inserts text at the blank second line - metadata stays same
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

    # Desktop sync → git auto-merges non-overlapping changes
    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    Then file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" should contain text "Appended from external."
    And file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" should contain text "Inserted from desktop."
    And file "{tmpDir}/wiki/tiddlers/AppendDoc.tid" should not contain text "<<<<<<< HEAD"

    # ══ Part B: Same-line edit conflict → conflict markers committed ══
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

    # External push edits the same line
    When I push a commit to bare repository "{tmpDir}/remote-diverge.git" adding file "tiddlers/ConflictDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226110000000
      title: ConflictDoc
      tags: Conflict

      External edited this line.
      """

    # Desktop edits the same line locally
    When I create file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226120000000
      title: ConflictDoc
      tags: Conflict

      Desktop edited this line.
      """
    Then I wait for tiddler "ConflictDoc" to be updated by watch-fs

    # Desktop sync → rebase commits conflict markers (git-sync-js behavior)
    When I clear test-id markers from logs
    When I click menu "知识库 > 立即同步云端"
    Then I wait for "git sync completed" log marker "[test-id-git-sync-complete]"
    # For true same-line conflicts, git-sync-js commits conflict markers as-is
    Then file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" should contain text "External edited this line."
    And file "{tmpDir}/wiki/tiddlers/ConflictDoc.tid" should contain text "Desktop edited this line."

  @git @mobilesync
  Scenario: Mobile HTTP git sync covers fast-forward, non-overlapping merge, same-name conflict, and body-merge conflict
    # ═══ Part 1: Fast-forward push ═══
    # Simplest case: mobile clones the wiki, adds a brand-new tiddler, and syncs.
    # No desktop-side changes between clone and sync → guaranteed fast-forward.
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone"

    # Mobile adds a new tiddler file (simulates tiddler created on mobile)
    When I create file "{tmpDir}/mobile-clone/tiddlers/MobileNote.tid" with content:
      """
      created: 20250226100000000
      modified: 20250226100000000
      title: MobileNote
      tags: Mobile

      Written on mobile phone.
      """
    When I sync "{tmpDir}/mobile-clone" via HTTP to workspace "wiki"
    # receive.denyCurrentBranch=updateInstead updates the desktop working tree on push
    Then file "{tmpDir}/wiki/tiddlers/MobileNote.tid" should contain text "Written on mobile phone."

    # ═══ Part 2: Non-overlapping merge with uncommitted desktop changes ═══
    # Desktop creates a tiddler through the browser UI
    When I create a tiddler "DesktopOnly" with tag "Desktop" in browser view

    # Mobile re-clones current state (ensureCommittedBeforeServe auto-commits DesktopOnly)
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone2"

    # Desktop creates another tiddler (uncommitted to git) after mobile cloned
    When I create a tiddler "DesktopNew" with tag "Desktop" in browser view

    # Mobile adds a non-overlapping tiddler
    When I create file "{tmpDir}/mobile-clone2/tiddlers/MobileNew.tid" with content:
      """
      created: 20250226120000000
      modified: 20250226120000000
      title: MobileNew
      tags: Mobile

      Mobile created this tiddler.
      """
    # Mobile syncs: commit → push to mobile-incoming → desktop merges → mobile pulls.
    # The push triggers ensureCommittedBeforeServe which auto-commits DesktopNew on desktop.
    # Desktop merges mobile-incoming into main (non-overlapping → auto-merge). Mobile pulls result.
    When I sync "{tmpDir}/mobile-clone2" via HTTP to workspace "wiki"
    Then file "{tmpDir}/wiki/tiddlers/MobileNew.tid" should contain text "Mobile created this tiddler."
    And file "{tmpDir}/wiki/tiddlers/DesktopNew.tid" should contain text "Desktop"

    # ═══ Part 3: Same-name tiddler conflict — mobile metadata wins ═══
    # Mobile clones the wiki
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone3"

    # Desktop creates a tiddler directly on disk (will be auto-committed by ensureCommittedBeforeServe)
    When I create file "{tmpDir}/wiki/tiddlers/SharedNote.tid" with content:
      """
      created: 20250226100000000
      modified: 20250226100500000
      title: SharedNote
      tags: Desktop

      Written on desktop.
      """

    # Mobile creates the same-titled tiddler with different content
    When I create file "{tmpDir}/mobile-clone3/tiddlers/SharedNote.tid" with content:
      """
      created: 20250226100000000
      modified: 20250226110000000
      title: SharedNote
      tags: Mobile

      Written on mobile.
      """

    # Mobile syncs: push to mobile-incoming branch → desktop merges into main → mobile pulls.
    # Desktop encounters a merge conflict (same file, different content on both sides).
    # Desktop's resolveTidConflictMarkers handles it:
    #   When the entire conflict block is in the header section (before first blank line),
    #   mobile's version ("theirs" from desktop's perspective) wins completely.
    #   Desktop's version is preserved in the git merge commit history for rollback.
    When I sync "{tmpDir}/mobile-clone3" via HTTP to workspace "wiki"

    # Verify: mobile metadata wins
    Then file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "tags: Mobile"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "modified: 20250226110000000"
    # Verify: mobile body text preserved
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "Written on mobile."
    # Verify: no conflict markers left
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should not contain text "<<<<<<<"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should not contain text "======="

    # ═══ Part 4: Both sides edit existing tiddler — body merged, metadata from mobile ═══
    # Create a tiddler that exists before mobile clones, so both sides share a common base
    When I create file "{tmpDir}/wiki/tiddlers/Journal.tid" with content:
      """
      created: 20250226090000000
      modified: 20250226090000000
      title: Journal
      tags: Original

      Line one from original.
      Line two from original.
      """
    # Clone – ensureCommittedBeforeServe auto-commits Journal.tid
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone4"

    # Desktop appends a line to the body (and TiddlyWiki bumps modified)
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

    # Mobile also appends a different line to the body
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

    # Mobile syncs. Desktop merges mobile-incoming into main and sees two conflict blocks:
    #   1. modified: field (header) → mobile wins (desktop prefers "theirs" = mobile for metadata)
    #   2. appended lines (body) → merge: keep desktop's + append mobile's unique lines
    When I sync "{tmpDir}/mobile-clone4" via HTTP to workspace "wiki"

    # Verify: mobile's modified timestamp wins
    Then file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "modified: 20250226110000000"
    # Verify: body text from BOTH sides preserved
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Mobile added this line."
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Desktop added this line."
    # Verify: original lines still there
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Line one from original."
    # Verify: clean merge, no conflict markers
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should not contain text "<<<<<<<"
