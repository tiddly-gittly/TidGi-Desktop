/*\
module-type: relinkmarkdownrule
title: $:/plugins/flibbles/relink/js/relinkoperations/text/markdowntext/footnote.js
type: application/javascript

Handles markdown footnotes

[1]: #link

\*/

var utils = require("$:/plugins/flibbles/relink/js/utils/markdown");

function FootnoteEntry() {};
FootnoteEntry.prototype.name = "markdownfootnote";
FootnoteEntry.prototype.report = function() {
	return ["[" + utils.abridge(this.caption) + "]:"];
};

exports.name = "markdownfootnote";
exports.types = {block: true};

exports.init = function(parser) {
	this.parser = parser;
	this.matchRegExp = /\[((?:[^\\\]]|\\.)*)\]:(\s*)(#?)(\S+)([^\S\n]*(?:\n|$))/mg;
	this.maxIndent = 3;
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var m = this.match,
		link = m[4],
		entry;
	this.parser.pos = m.index + m[0].length;
	if (m[1].charAt(0) !== "^"
	 && (m[3] === "#" || options.wiki.isImageTiddler(toTitle))
	 && decodeURIComponent(link) === fromTitle) {
		entry = new FootnoteEntry();
		entry.caption = m[1];
		entry.output = this.indentString + "[" + m[1] + "]:" + m[2] + m[3] + utils.encodeLink(toTitle) + m[5];
	}
	return entry;
};
