Feature: Mobile Sync via HTTP Git Endpoints
  As a user who syncs between TidGi Desktop and TidGi Mobile
  I want the mobile to push and pull from the desktop via Smart HTTP git endpoints
  So that my wiki stays consistent across devices

  Background:
    Given I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    Then I should see a "default wiki workspace" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    # Enable HTTP API so the tw-mobile-sync Smart HTTP endpoints are accessible
    When I update workspace "wiki" settings:
      | property      | value |
      | enableHTTPAPI | true  |
      | port          | 15212 |
    Then the browser view should be loaded and visible
    And I wait for "git initialization" log marker "[test-id-git-init-complete]"

  @git @mobilesync
  Scenario: Mobile clones desktop wiki via HTTP and pushes a new tiddler - fast-forward
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

  @git @mobilesync
  Scenario: Mobile syncs while desktop has uncommitted changes - non-overlapping files
    # Desktop creates a tiddler through the browser UI
    When I create a tiddler "DesktopOnly" with tag "Desktop" in browser view

    # Mobile clones current state (ensureCommittedBeforeServe auto-commits DesktopOnly)
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone"

    # Desktop creates another tiddler (uncommitted to git) after mobile cloned
    When I create a tiddler "DesktopNew" with tag "Desktop" in browser view

    # Mobile adds a non-overlapping tiddler
    When I create file "{tmpDir}/mobile-clone/tiddlers/MobileNew.tid" with content:
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
    When I sync "{tmpDir}/mobile-clone" via HTTP to workspace "wiki"
    Then file "{tmpDir}/wiki/tiddlers/MobileNew.tid" should contain text "Mobile created this tiddler."
    And file "{tmpDir}/wiki/tiddlers/DesktopNew.tid" should contain text "Desktop"

  @git @mobilesync
  Scenario: Both sides create same-named tiddler - conflict resolved by mobile strategy
    # Mobile clones the wiki
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone"

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
    When I create file "{tmpDir}/mobile-clone/tiddlers/SharedNote.tid" with content:
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
    When I sync "{tmpDir}/mobile-clone" via HTTP to workspace "wiki"

    # Verify: mobile metadata wins
    Then file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "tags: Mobile"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "modified: 20250226110000000"
    # Verify: mobile body text preserved
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should contain text "Written on mobile."
    # Verify: no conflict markers left
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should not contain text "<<<<<<<"
    And file "{tmpDir}/wiki/tiddlers/SharedNote.tid" should not contain text "======="

  @git @mobilesync
  Scenario: Both sides edit existing tiddler - body text merged, metadata from mobile
    # First create a tiddler that exists before mobile clones, so both sides share a common base
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
    When I clone workspace "wiki" via HTTP to "{tmpDir}/mobile-clone"

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
    When I create file "{tmpDir}/mobile-clone/tiddlers/Journal.tid" with content:
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
    When I sync "{tmpDir}/mobile-clone" via HTTP to workspace "wiki"

    # Verify: mobile's modified timestamp wins
    Then file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "modified: 20250226110000000"
    # Verify: body text from BOTH sides preserved
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Mobile added this line."
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Desktop added this line."
    # Verify: original lines still there
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should contain text "Line one from original."
    # Verify: clean merge, no conflict markers
    And file "{tmpDir}/wiki/tiddlers/Journal.tid" should not contain text "<<<<<<<"
