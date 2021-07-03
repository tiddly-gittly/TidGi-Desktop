/*\
title: $:/plugins/linonetwo/preview-glass/link.js
type: application/javascript
module-type: startup
Enhances the link widget for on-hover previews

Modified by LinOnetwo

@preserve
\*/
/*jslint node: true, browser: true */
/*global $tw: false */

(function () {
  var // Global flag to stop mouseover madness
    block,
    // Get core link widget
    CoreLink = require('$:/core/modules/widgets/link.js').link,
    // Store ref to render() and handleClickEvent()
    renderCore = CoreLink.prototype.render,
    clickCore = CoreLink.prototype.handleClickEvent;

  // Hijack core link widget render()
  CoreLink.prototype.render = function () {
    // Run core handler
    renderCore.apply(this, arguments);
    var self = this,
      wiki = this.wiki,
      // The link node
      el = this.domNodes[0],
      // Target tiddler
      to = wiki.getTiddler(self.to),
      // Shortcut to defaults namespace
      defaults = '$:/plugins/linonetwo/preview-glass/defaults/',
      // Shortcut to preview namespace
      preview = '$:/temp/tobibeer/preview-',
      // Modifier keys to quick-show the popup w/o delay
      keys = $tw.utils.parseKeyDescriptorTB(wiki.getTextReference(defaults + 'keys', '').toUpperCase()),
      // Delay for popup rendering
      delay = wiki.getTextReference(defaults + 'delay').toUpperCase(),
      //Check if popup already open
      getInfo = function (el) {
        // Get current popup level
        var info = $tw.popup.popupInfo(el),
          // Get current popup level
          level = info.popupLevel;
        return wiki.getTextReference(preview + level) && wiki.getTextReference(preview + level + '-tiddler') === self.to
          ? null
          : info;
      },
      // Displays the preview popup
      showPopup = function () {
        var level,
          // Get info (only if not open yet)
          info = getInfo(el);
        // Not open yet and not yet blocking mouseover madness?
        if (info) {
          // Get current popup level
          level = info.popupLevel;
          // Stop waiting for other popups to pop up
          clearTimeout(self.previewTimeout);
          // Quite all of outer level
          $tw.popup.cancel(level);
          // Level up
          level++;
          // Store reference to tiddler to be previewed for level
          wiki.setText(preview + level + '-tiddler', 'text', null, self.to);
          // Store the popup details if not already there
          if ($tw.popup.findPopup(preview + level) === -1) {
            // Show popup with timeout, to get past nextTick
            setTimeout(function () {
              // Core popup triggering
              $tw.popup.triggerPopup({
                // For this tiddler
                domNode: el,
                // The state for this level
                title: preview + level,
                wiki: wiki,
              });
              block = 0;
            }, 50);
          }
        }
      },
      // A helper to determine whether or not to actually show the popup
      show = function () {
        var ex,
          exclude,
          // By default, show
          doShow = 1,
          // The css classes in which not to display previews for links
          not = wiki.getTextReference(defaults + 'not', '');
        // Got any?
        if (not) {
          // Split classes and loop
          $tw.utils.each(not.split(' '), function (n) {
            // This node
            var node = el;
            // Loop so long as parent-nodes and still displaying
            while (node && doShow) {
              // Node has exclude-class?
              if ($tw.utils.hasClass(node, n)) {
                // Ok, so we're not showing
                doShow = 0;
                // Stop iterating
                return false;
              }
              // Next partent
              node = node.parentNode;
            }
          });
        }
        // Not aborted yet?
        if (doShow) {
          // get exclude filter
          exclude = wiki.getTextReference(defaults + 'exclude', '');
          // Fetch excluded titles
          ex = exclude ? wiki.filterTiddlers(exclude) : [];
          // Title in excludes?
          if (ex.indexOf(self.to) >= 0) {
            // Then don't display
            doShow = 0;
          }
        }
        // Return what we got
        return doShow;
      };
    // Turn delay to integer
    delay = delay !== undefined ? parseInt(delay) : null;
    // Not a number?
    if (delay !== null && isNaN(delay)) {
      // No delay
      delay = 0;
    }
    // Target tiddler exists?
    if (to) {
      // Add handle class
      $tw.utils.addClass(el, 'tc-popup-handle');
      // Add absolute positioning class
      $tw.utils.addClass(el, 'tc-popup-absolute');
      // Loop new event handlers
      ['mouseover', 'mouseout'].forEach(function (e) {
        // Create event listener
        el.addEventListener(e, function (event) {
          // Ref to event
          var ev = event || window.event;
          // On mouseover
          if (e === 'mouseover') {
            // Actually showing anything?
            if (show()) {
              // No keycode?
              if (!ev.keyCode) {
                // Set to 0, for whatever reason the core expects one
                ev.keyCode = 0;
              }
              // Modifier keys say we show directly?
              if ($tw.utils.checkKeyDescriptorTB(ev, keys)) {
                // Not yet blocking mousover madness?
                if (!block) {
                  // Block further firing of mouseover events
                  block = 1;
                  // Then show
                  showPopup();
                }
                // Modifiers don't match but we got a delay?
              } else if (delay !== null) {
                // No more blocking of mouseover events
                block = 0;
                // Set timeout and wait to show popup
                self.previewTimeout = setTimeout(showPopup, delay);
              }
            }
            // Mouseout
          } else {
            // No more blocking of mouseover events
            block = 0;
            // No more waiting for the popup
            clearTimeout(self.previewTimeout);
            // close popup
						 // if next object to move mouse to is not a popup
            if(!event.relatedTarget || !event.relatedTarget.classList.contains('tc-preview-tiddler')) {
              // then close popup
            	$tw.popup.cancel(Math.max(0, getInfo(el).popupLevel));
						}
          }
        });
      });
    }
  };

  // Hijack click handler
  CoreLink.prototype.handleClickEvent = function () {
    // Run core handler
    clickCore.apply(this, arguments);
    // Abort popup delay timeout
    clearTimeout(this.previewTimeout);
    // Close popups
    $tw.popup.cancel(Math.max(0, $tw.popup.popupInfo(this.domNodes[0]).popupLevel));
  };
})();