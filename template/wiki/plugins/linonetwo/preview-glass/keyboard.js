/*\
title: $:/plugins/tobibeer/preview/keyboard.js
type: application/javascript
module-type: utils
Fixes $:/core/modules/utils/dom/keyboard.js by providing an alternative.
Do not use as an API, let's fix the core.
@preserve
\*/
(function(){

  /*jslint node: true, browser: true */
  /*global $tw: false */
  "use strict";
  
  var namedKeys = {
    "BACKSPACE": 8,
    "TAB": 9,
    "ENTER": 13,
    "ESCAPE": 27,
    "PAGEUP": 33,
    "PAGEDOWN": 34,
    "END": 35,
    "HOME": 36,
    "LEFT":	37,
    "UP": 38,
    "RIGHT": 39,
    "DOWN": 40,
    "INSERT": 45,
    "DELETE": 46
  };
  
  /*
  Parses a key descriptor into the structure:
  {
    keyCode: numeric keycode
    shiftKey: boolean
    altKey: boolean
    ctrlKey: boolean
  }
  Key descriptors have the following format:
    ctrl+enter
    ctrl+shift+alt+A
  */
  exports.parseKeyDescriptorTB = function(keyDescriptor) {
    var neg,s,t,
      components = keyDescriptor.toUpperCase().split("+"),
      info = {
        keyCode: null,
        shiftKey: false,
        altKey: false,
        ctrlKey: false
      };
    for(t=0; t<components.length; t++) {
      neg = false;
      s = components[t];
      // Look for negation
      if(s.substr(0,1) === "!") {
        neg = true;
        s = s.substr(1);
      }
      // Look for modifier keys
      if(s === "CTRL") {
        info.ctrlKey = neg ? null : true;
      } else if(s === "SHIFT") {
        info.shiftKey =  neg ? null : true;
      } else if(s === "ALT") {
        info.altKey =  neg ? null : true;
      } else if(s === "META") {
        info.metaKey =  neg ? null : true;
      // Replace named keys with their code
      } else if(namedKeys[s]) {
        info.keyCode = namedKeys[s];
      // Normal letter
      } else {
        info.keyCode = s.charCodeAt(0);
      }
    }
    return info;
  };
  
  exports.checkKeyDescriptorTB = function(event,keyInfo) {
    var metaKeyStatus = !!keyInfo.metaKey; // Using a temporary variable to keep JSHint happy
    return (keyInfo.keyCode === null || event.keyCode === keyInfo.keyCode) &&
      (keyInfo.shiftKey === null ? !event.shiftKey : event.shiftKey === keyInfo.shiftKey) &&
      (keyInfo.altKey === null ? !event.altKey : event.altKey === keyInfo.altKey) &&
      (keyInfo.ctrlKey === null ? !event.ctrlKey : event.ctrlKey === keyInfo.ctrlKey) &&
      (keyInfo.metaKey === null ? !event.metaKey : event.metaKey === metaKeyStatus);
  };
  
  })();