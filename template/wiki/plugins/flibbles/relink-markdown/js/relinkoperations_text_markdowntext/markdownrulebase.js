/*\
title: $:/plugins/flibbles/relink/js/relinkoperations/text/markdowntext/markdownrulebase.js
type: application/javascript
module-type: global

Base class for markdown parser rules

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

var utils = require("$:/plugins/flibbles/relink/js/utils/markdown");

var MarkdownRuleBase = function() {};

MarkdownRuleBase.prototype.init = function(parser) {
	this.parser = parser;
};

MarkdownRuleBase.prototype.findNextMatch = function(startPos) {
	this.matchRegExp.lastIndex = startPos;
	while (this.match = this.matchRegExp.exec(this.parser.source)) {
		if (utils.indexOfParagraph(this.match[0]) >= 0) {
			continue;
		}
		if (this.maxIndent !== undefined) {
			var indent = utils.indentation(this.parser.source,this.match.index);
			if (indent < 0
			 || (this.parser.indent !== undefined
			  && (indent > this.parser.indent + this.maxIndent))) {
				continue;
			}
			var nl = this.parser.source.lastIndexOf('\n', this.match.index-1)+1;
			this.indentString = this.parser.source.substring(nl, this.match.index);
			return nl < startPos ? startPos : nl;
		}
		return this.match.index;
	}
	return undefined;
};


exports.MarkdownRuleBase = MarkdownRuleBase;

})();
