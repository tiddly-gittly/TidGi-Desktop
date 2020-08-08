/*\
module-type: filteroperator

This filter acts as a namespace for several small, simple filters, such as

`[relink:impossible[]]`

\*/

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var language = require('$:/plugins/flibbles/relink/js/language.js');

var relinkFilterOperators;

function getRelinkFilterOperators() {
	if(!relinkFilterOperators) {
		relinkFilterOperators = {};
		$tw.modules.applyMethods("relinkfilteroperator",
		                         relinkFilterOperators);
	}
	return relinkFilterOperators;
}

exports.relink = function(source,operator,options) {
	var suffixPair = parseSuffix(operator.suffix);
	var relinkFilterOperator = getRelinkFilterOperators()[suffixPair[0]];
	if (relinkFilterOperator) {
		var newOperator = $tw.utils.extend({}, operator);
		newOperator.suffix = suffixPair[1];
		return relinkFilterOperator(source, newOperator, options);
	} else {
		return [language.getString("Error/RelinkFilterOperator", options)];
	}
};

function parseSuffix(suffix) {
	var index = suffix? suffix.indexOf(":"): -1;
	if (index >= 0) {
		return [suffix.substr(0, index), suffix.substr(index+1)];
	} else {
		return [suffix];
	}
}
