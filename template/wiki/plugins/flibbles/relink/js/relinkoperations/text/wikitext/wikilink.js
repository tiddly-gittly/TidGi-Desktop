/*\
module-type: relinkwikitextrule

Handles CamelCase links

WikiLink

but not:

~WikiLink

\*/

var utils = require("./utils.js");

exports.name = "wikilink";

exports.report = function(text, callback, options) {
	var title = this.match[0],
		unlink = $tw.config.textPrimitives.unWikiLink;
	this.parser.pos = this.matchRegExp.lastIndex;
	if (title[0] !== unlink) {
		callback(title, unlink + title);
	}
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var entry = undefined,
		title = this.match[0];
	this.parser.pos = this.matchRegExp.lastIndex;
	if (title === fromTitle && title[0] !== $tw.config.textPrimitives.unWikiLink) {
		entry = { output: this.makeWikilink(toTitle, options) };
		if (entry.output === undefined) {
			entry.impossible = true;
		}
	}
	return entry;
};

exports.makeWikilink = function(title, options) {
	if (title.match(this.matchRegExp) && title[0] !== $tw.config.textPrimitives.unWikiLink) {
		return title;
	} else {
		return utils.makePrettylink(this.parser, title);
	}
};
