"use strict";Object.defineProperty(exports,"__esModule",{value:true});var _createClass=function(){function e(e,t){for(var i=0;i<t.length;i++){var r=t[i];r.enumerable=r.enumerable||false;r.configurable=true;if("value"in r)r.writable=true;Object.defineProperty(e,r.key,r)}}return function(t,i,r){if(i)e(t.prototype,i);if(r)e(t,r);return t}}();/* @preserve TW-Guard */
/*\

title: $:/plugins/felixhayashi/tiddlymap/js/services/tracker
type: application/javascript
module-type: library

@preserve

\*/
/* @preserve TW-Guard */var _utils=require("$:/plugins/felixhayashi/tiddlymap/js/utils");var _utils2=_interopRequireDefault(_utils);function _interopRequireDefault(e){return e&&e.__esModule?e:{default:e}}function _classCallCheck(e,t){if(!(e instanceof t)){throw new TypeError("Cannot call a class as a function")}}var Tracker=function(){function e(t){_classCallCheck(this,e);this.wiki=$tw.wiki;this.logger=$tm.logger;this._createIndex()}_createClass(e,[{key:"_createIndex",value:function e(){var t=this.tById={};var i=this.idByT={};this.wiki.each(function(e,r){if(_utils2.default.isSystemOrDraft(e)){return}var l=e.fields["tmap.id"];if(!l){l=_utils2.default.genUUID();_utils2.default.setField(e,"tmap.id",l)}t[l]=r;i[r]=l})}},{key:"assignId",value:function e(t,i){var r=_utils2.default.getTiddler(t);if(!r){throw new ResourceNotFoundException(t)}var l=r.fields["tmap.id"];if(!l||i){l=_utils2.default.genUUID();_utils2.default.setField(r,"tmap.id",l);this.logger("info","Assigning new id to",r.fields.title)}this.tById[l]=r.fields.title;this.idByT[r.fields.title]=l;return l}},{key:"getIdByTiddler",value:function e(t){return this.idByT[_utils2.default.getTiddlerRef(t)]}},{key:"getIdsByTiddlers",value:function e(){return this.idByT}},{key:"getTiddlersByIds",value:function e(){return this.tById}},{key:"getTiddlerById",value:function e(t){return this.tById[t]}}]);return e}();exports.default=Tracker;
//# sourceMappingURL=./maps/felixhayashi/tiddlymap/js/services/Tracker.js.map
