/*\
module-type: allfilteroperator

Filter function for [all[relinkable]].
Returns all tiddlers subject to relinking.

\*/

(function() {

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

exports.relinkable = function(source,prefix,options) {
	return options.wiki.getRelinkableTitles();
};

})();
