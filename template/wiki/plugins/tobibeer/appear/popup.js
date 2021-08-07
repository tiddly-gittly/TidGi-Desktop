/*\
title: $:/plugins/tobibeer/appear/popup.js
type: application/javascript
module-type: utils

An enhanced version of the core Popup to support:
* absolute popups
* preview popups
* popup z-index

@preserve
\*/
(function () {
  /*jslint node: true, browser: true */
  /*global $tw: false */
  'use strict';

  const Popup = require('$:/core/modules/utils/dom/popup.js').Popup,
    Reveal = require('$:/core/modules/widgets/reveal.js').reveal,
    refreshCoreReveal = Reveal.prototype.refresh;

  const originalShow = Popup.prototype.show;

  /*
  Hijack and overwrite core Popup show() method
    => required for absolute popup positioning, rather than relative
  */
  Popup.prototype.show = function (options) {
    // fix https://github.com/tobibeer/tw5-appear/issues/5
    if (!options.domNode) {
      return originalShow.call(this, options);
    }
    // The button
    let cancelLevel;
    let el = options.domNode;
    // Check if button absolutely positioned
    let absolute = $tw.utils.hasClass(el, 'tc-popup-absolute');
    // Find out what was clicked on
    let info = this.popupInfo(el);
    // Helper to calculate the absolte offset
    const calcAbsoluteOffset = function (el) {
      let e = el;
			let x = 0;
			let y = 0;
      do {
        x += e.offsetLeft || 0;
        y += e.offsetTop || 0;
        e = e.offsetParent;
      } while (e);
      return { left: x, top: y };
    };
    let offset = {
      left: el.offsetLeft,
      top: el.offsetTop,
    };
    // Level to be canceled
    cancelLevel = info.popupLevel;
    // If we clicked on a handle
    if (info.isHandle) {
      // Next level
      cancelLevel++;
    }
    // Cancel any higher level popups
    this.cancel(cancelLevel);
    // Store the popup details if not already there
    if (this.findPopup(options.title) === -1) {
      // Store the popup details
      this.popups.push({
        title: options.title,
        wiki: options.wiki,
        domNode: el,
      });
    }
    // Calculate absolute offset?
    offset = absolute ? calcAbsoluteOffset(el) : offset;
    // Set the state tiddler
    options.wiki.setTextReference(options.title, '(' + offset.left + ',' + offset.top + ',' + el.offsetWidth + ',' + el.offsetHeight + ')');
    // Add the click handler if we have any popups
    if (this.popups.length > 0) {
      this.rootElement.addEventListener('click', this, true);
    }
  };

  // Hijack popupInfo() of core Popup ($tw.popup)
  Popup.prototype.popupInfo = function (domNode) {
    var popupCount,
      isHandle = false,
      node = domNode;
    // First check ancestors to see if we're within a popup handle
    while (node && popupCount === undefined) {
      // When
      if (
        // This is a handle
        $tw.utils.hasClass(node, 'tc-popup-handle') ||
        // Or a sticky popup
        $tw.utils.hasClass(node, 'tc-popup-keep')
      ) {
        // We set this flag (not exactly sure about the general idea here)
        isHandle = true;
      }
      // When
      if (
        // It's a reveal
        $tw.utils.hasClass(node, 'tc-reveal') &&
        // Being a popup
        ($tw.utils.hasClass(node, 'tc-popup') ||
          // Or a popup-handle reveal (the choice of name seems confusing)
          $tw.utils.hasClass(node, 'tc-popup-handle'))
      ) {
        // Calculate popup level via zIndex
        popupCount = parseInt(node.style.zIndex) - 1000;
      }
      // Next Parent
      node = node.parentNode;
    }
    // Create info object
    var info = {
      popupLevel: popupCount || 0,
      isHandle: isHandle,
    };
    return info;
  };

  /*
  Hijack core handleEvent
  */
  Popup.prototype.handleEvent = function (event) {
    if (event.type === 'click') {
      // Find out what was clicked on
      var info = this.popupInfo(event.target),
        cancelLevel = info.popupLevel - 1;
      // Don't remove the level that was clicked on if we clicked on a handle
      if (info.isHandle) {
        if (cancelLevel < 0) {
          cancelLevel = 1;
        } else {
          cancelLevel++;
        }
      }
      // Cancel
      this.cancel(cancelLevel);
    }
  };

  // Hijack readPopupState of core reveal widget to set zIndex
  Reveal.prototype.refresh = function () {
    var domNode,
      result,
      wasOpen = this.isOpen;
    // Run core handler
    result = refreshCoreReveal.apply(this, arguments);
    // Reference to domNode
    domNode = this.domNodes[0];
    if (
      // If the popup is now open AND
      this.isOpen &&
      // It was not before
      (wasOpen !== this.isOpen ||
        // Or does not have a zIndex
        !domNode.style.zIndex) &&
      // AND
      // There actually is a domNode AND
      domNode &&
      // This is a popup reveal OR
      (this.type === 'popup' ||
        // It's a dropdown-reveal
        ($tw.utils.hasClass(domNode, 'tc-block-dropdown') && $tw.utils.hasClass(domNode, 'tc-reveal')))
    ) {
      // Dynamically set z-index
      domNode.style.zIndex = 1000 + $tw.popup.popups.length;
    }
    return result;
  };
})();
