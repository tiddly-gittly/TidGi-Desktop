/*\
title: $:/core/modules/filters/splitbefore.js
type: application/javascript
module-type: relinkfilteroperator

Filter operator that splits each result on the last occurance of the specified separator and returns the last bit.

What does this have to do with relink? Nothing. I need this so I can render
the configuration menu. I //could// use [splitregexp[]], but then I'd be
limited to Tiddlywiki v5.1.20 or later.

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

/*
Export our filter function
*/
exports.splitafter = function(source,operator,options) {
	var results = [];
	source(function(tiddler,title) {
		var index = title.lastIndexOf(operator.operand);
		if(index < 0) {
			$tw.utils.pushTop(results,title);
		} else {
			$tw.utils.pushTop(results,title.substr(index+1));
		}
	});
	return results;
};

})();

