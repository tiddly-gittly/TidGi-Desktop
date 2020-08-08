"use strict";Object.defineProperty(exports,"__esModule",{value:true});var _createClass=function(){function t(t,e){for(var i=0;i<e.length;i++){var n=e[i];n.enumerable=n.enumerable||false;n.configurable=true;if("value"in n)n.writable=true;Object.defineProperty(t,n.key,n)}}return function(e,i,n){if(i)t(e.prototype,i);if(n)t(e,n);return e}}();function _classCallCheck(t,e){if(!(t instanceof e)){throw new TypeError("Cannot call a class as a function")}}
/* @preserve TW-Guard */
/*\

title: $:/plugins/felixhayashi/tiddlymap/js/lib/SelectionRectangle
type: application/SelectionRectangle
module-type: library

@preserve

\*/
/* @preserve TW-Guard */var SelectionRectangle=function(){function t(e,i){_classCallCheck(this,t);this.x1=e;this.x2=e;this.y1=i;this.y2=i}_createClass(t,[{key:"span",value:function t(e,i){this.x2=e;this.y2=i}},{key:"getWidth",value:function t(){return this.x2-this.x1}},{key:"getHeight",value:function t(){return this.y2-this.y1}},{key:"getRect",value:function t(){return[this.x1,this.y1,this.getWidth(),this.getHeight()]}},{key:"isPointWithin",value:function t(e){var i=e.x,n=e.y;var a=this.x1,r=this.x2,s=this.y1,u=this.y2;var h=Math.min(a,r);var c=Math.max(a,r);var l=Math.min(s,u);var o=Math.max(s,u);return h<i&&i<c&&l<n&&n<o}}]);return t}();exports.default=SelectionRectangle;
//# sourceMappingURL=./maps/felixhayashi/tiddlymap/js/lib/SelectionRectangle.js.map
