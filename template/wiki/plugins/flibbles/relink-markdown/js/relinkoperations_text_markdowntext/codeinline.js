/*\
module-type: relinkmarkdownrule
title: $:/plugins/flibbles/relink/js/relinkoperations/text/markdowntext/codeinline.js
type: application/javascript

Handles markdown `code` and ``code``.

\*/

var utils = require("$:/plugins/flibbles/relink/js/utils/markdown");

exports.name = "codeinline";
exports.types = {inline: true};

exports.init = function(parser) {
	this.parser = parser;
};

exports.findNextMatch = function(startPos) {
	var match, matchRegExp = /`+/mg;
	matchRegExp.lastIndex = startPos;
	while (match = matchRegExp.exec(this.parser.source)) {
		var next = this.parser.source.indexOf(match[0], matchRegExp.lastIndex);
		// make sure we find the corresponding ticks
		if (next >= 0) {
			// Make sure it's the right length
			var end = next + match[0].length;
			if (match[0].length < 3 || !isLineStart(this.parser.source, next)) {
				if (this.parser.source.charAt(end) !== '`') {
					// make sure there aren't paragraph breaks between the points
					var nextGraph = utils.indexOfParagraph(this.parser.source, matchRegExp.lastIndex);
					if (nextGraph < 0 || nextGraph > next) {
						this.end = end;
						return match.index;
					}
				}
			}
		}
	}
	return undefined;
};

function isLineStart(text, pos) {
	// if 3 or less spaces precede it, it's a line start.
	var p = text.lastIndexOf('\n', pos);
	if (pos - p > 3) {
		return false;
	}
	while (++p < pos) {
		if (text.charAt(p) !== ' ') {
			return false;
		}
	}
	return true;
};

exports.relink = function() {
	this.parser.pos = this.end;
	return undefined;
};

exports.report = exports.relink;
