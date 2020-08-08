"use strict";Object.defineProperty(exports,"__esModule",{value:true});var _createClass=function(){function e(e,r){for(var t=0;t<r.length;t++){var s=r[t];s.enumerable=s.enumerable||false;s.configurable=true;if("value"in s)s.writable=true;Object.defineProperty(e,s.key,s)}}return function(r,t,s){if(t)e(r.prototype,t);if(s)e(r,s);return r}}();function _classCallCheck(e,r){if(!(e instanceof r)){throw new TypeError("Cannot call a class as a function")}}
/* @preserve TW-Guard */
/*\

title: $:/plugins/felixhayashi/tiddlymap/js/EdgeTypeSubscriberRegistry
type: application/javascript
module-type: library

@preserve

\*/
/* @preserve TW-Guard */var EdgeTypeSubscriberRegistry=function(){function e(r,t,s){_classCallCheck(this,e);this.subscriberClasses=r;this.tracker=s;this.updateIndex(t)}_createClass(e,[{key:"getAllForType",value:function e(r){var t=this.allSubscribers;var s=[];for(var i=0,a=t.length;i<a;i++){if(t[i].canHandle(r)){s.push(t[i]);if(t[i].skipOthers){break}}}return s}},{key:"getAll",value:function e(){return this.allSubscribers}},{key:"updateIndex",value:function e(r){var t=[];var s=this.subscriberClasses;for(var i in s){var a=new s[i](r);a.setTracker(this.tracker);if(a.ignore===true){continue}t.push(a)}t.sort(function(e,r){return r.priority-e.priority});this.allSubscribers=t}}]);return e}();exports.default=EdgeTypeSubscriberRegistry;
//# sourceMappingURL=./maps/felixhayashi/tiddlymap/js/edgeTypeSubscriber/EdgeTypeSubscriberRegistry.js.map
