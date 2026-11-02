@saveReliability
Feature: Preserve edits until the filesystem acknowledges them
  Background:
    Given I start mock analytics server
    And I cleanup test wiki so it could create a new one on start
    And I launch the TidGi application
    And I wait for the page to load completely
    When I click on a "default wiki workspace button" element with selector "div[data-testid^='workspace-']:has-text('wiki')"
    Then the browser view should be loaded and visible
    And I wait for "SSE backend ready" log marker "[test-id-SSE_READY]"

  @saveReliability-reload
  Scenario: A late unsaved edit vetoes programmatic reload and can subsequently reach disk
    When I execute TiddlyWiki code in browser view: "$tw.wiki.addTiddler(new $tw.Tiddler({title: 'SaveReliabilityFixture', text: 'Synthetic baseline saved to disk'}))"
    Then tiddler "SaveReliabilityFixture" in workspace "wiki" should be saved to disk with text "Synthetic baseline saved to disk"
    # Start clean, then simulate an edit in the gap after the pre-restart probe.
    # Pausing only this fixture's adaptor leaves the real core dirty/unload logic intact.
    When I execute TiddlyWiki code in browser view: "return new Promise(resolve => { const check = () => { if ($tw.syncer.isDirty() || $tw.syncer.numTasksInProgress) { setTimeout(check, 25); return; } window.saveReliabilityFixture = {ready: $tw.syncadaptor.isReady, unloadSeen: false}; $tw.syncadaptor.isReady = () => false; window.addEventListener('beforeunload', () => { window.saveReliabilityFixture.unloadSeen = true; }, {once: true}); $tw.wiki.addTiddler(new $tw.Tiddler({title: 'SaveReliabilityFixture', text: 'Synthetic late edit must survive reload'})); if (!$tw.syncer.isDirty()) throw new Error('Fixture did not become dirty'); resolve(true); }; check(); })"
    # This calls the application's real Electron WebContents reload path, not a synthetic DOM event.
    When I execute TiddlyWiki code in browser view: "return window.service.view.reloadViewsWebContents(window.meta().workspace.id).then(() => { throw new Error('Dirty reload unexpectedly completed'); }, () => { if (!window.saveReliabilityFixture?.unloadSeen || !$tw.syncer.isDirty() || $tw.wiki.getTiddlerText('SaveReliabilityFixture') !== 'Synthetic late edit must survive reload') throw new Error('Late edit or original renderer was lost'); const marker = document.createElement('div'); marker.textContent = 'Verified real Electron reload veto preserved synthetic edit'; document.body.appendChild(marker); return true; })"
    Then I should see "Verified real Electron reload veto preserved synthetic edit" in the browser view content
    When I execute TiddlyWiki code in browser view: "$tw.syncadaptor.isReady = window.saveReliabilityFixture.ready; delete window.saveReliabilityFixture; $tw.syncer.processTaskQueue()"
    Then tiddler "SaveReliabilityFixture" in workspace "wiki" should be saved to disk with text "Synthetic late edit must survive reload"
    When I restart workspace "wiki"
    Then the browser view should be loaded and visible
    When I open tiddler "SaveReliabilityFixture" in browser view
    Then I should see "Synthetic late edit must survive reload" in the browser view content
