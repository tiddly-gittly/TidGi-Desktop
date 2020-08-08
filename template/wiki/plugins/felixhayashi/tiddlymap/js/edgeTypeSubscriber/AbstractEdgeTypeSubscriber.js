"use strict";Object.defineProperty(exports,"__esModule",{value:true});var _createClass=function(){function e(e,r){for(var t=0;t<r.length;t++){var i=r[t];i.enumerable=i.enumerable||false;i.configurable=true;if("value"in i)i.writable=true;Object.defineProperty(e,i.key,i)}}return function(r,t,i){if(t)e(r.prototype,t);if(i)e(r,i);return r}}();/* @preserve TW-Guard */ /* @preserve TW-Guard */
/*\

title: $:/plugins/felixhayashi/tiddlymap/js/AbstractEdgeTypeSubscriber
type: application/javascript
module-type: library

@preserve

\*/
/* @preserve TW-Guard */
/* @preserve TW-Guard */var _EdgeType=require("$:/plugins/felixhayashi/tiddlymap/js/EdgeType");var _EdgeType2=_interopRequireDefault(_EdgeType);var _exception=require("$:/plugins/felixhayashi/tiddlymap/js/exception");function _interopRequireDefault(e){return e&&e.__esModule?e:{default:e}}function _classCallCheck(e,r){if(!(e instanceof r)){throw new TypeError("Cannot call a class as a function")}}var AbstractEdgeTypeSubscriber=function(){function e(r){var t=arguments.length>1&&arguments[1]!==undefined?arguments[1]:{},i=t.priority,n=i===undefined?0:i,a=t.skipOthers,s=a===undefined?true:a,u=t.ignore,l=u===undefined?false:u;_classCallCheck(this,e);this.allEdgeTypes=r;this.priority=n;this.skipOthers=s;this.ignore=l}_createClass(e,[{key:"setTracker",value:function e(r){this.tracker=r}},{key:"loadEdges",value:function e(r,t,i){throw new _exception.MissingOverrideError(this,"loadEdges")}},{key:"canHandle",value:function e(r){throw new _exception.MissingOverrideError(this,"canHandle")}},{key:"insertEdge",value:function e(r,t,i){}},{key:"deleteEdge",value:function e(r,t,i){}}]);return e}();exports.default=AbstractEdgeTypeSubscriber;
//# sourceMappingURL=./maps/felixhayashi/tiddlymap/js/edgeTypeSubscriber/AbstractEdgeTypeSubscriber.js.map
