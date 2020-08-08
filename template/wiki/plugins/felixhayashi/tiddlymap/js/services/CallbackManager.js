"use strict";Object.defineProperty(exports,"__esModule",{value:true});var _createClass=function(){function e(e,t){for(var a=0;a<t.length;a++){var l=t[a];l.enumerable=l.enumerable||false;l.configurable=true;if("value"in l)l.writable=true;Object.defineProperty(e,l.key,l)}}return function(t,a,l){if(a)e(t.prototype,a);if(l)e(t,l);return t}}();/* @preserve TW-Guard */
/*\

title: $:/plugins/felixhayashi/tiddlymap/js/CallbackManager
type: application/javascript
module-type: library

@preserve

\*/
/* @preserve TW-Guard */var _utils=require("$:/plugins/felixhayashi/tiddlymap/js/utils");var _utils2=_interopRequireDefault(_utils);function _interopRequireDefault(e){return e&&e.__esModule?e:{default:e}}function _classCallCheck(e,t){if(!(e instanceof t)){throw new TypeError("Cannot call a class as a function")}}var CallbackManager=function(){function e(){_classCallCheck(this,e);this.callbacks=_utils2.default.makeHashMap();this.logger=$tm.logger;this.wiki=$tw.wiki}_createClass(e,[{key:"add",value:function e(t,a){var l=arguments.length>2&&arguments[2]!==undefined?arguments[2]:true;this.logger("debug",'A callback was registered for changes of "'+t+'"');this.callbacks[t]={execute:a,isDeleteOnCall:l}}},{key:"remove",value:function e(t){if(!t){return}if(typeof t==="string"){t=[t]}for(var a=t.length;a--;){var l=t[a];if(this.callbacks[l]){this.logger("debug",'Deleting callback for "'+l+'"');delete this.callbacks[l]}}}},{key:"refresh",value:function e(t){if(this.callbacks.length==0){return}for(var a in t){if(!this.callbacks[a]){continue}if(this.wiki.getTiddler(a)){this.logger("debug","Executing a callback for: "+a);this.callbacks[a].execute(a);if(!this.callbacks.isDeleteOnCall){continue}}this.remove(a)}}}]);return e}();exports.default=CallbackManager;
//# sourceMappingURL=./maps/felixhayashi/tiddlymap/js/services/CallbackManager.js.map
