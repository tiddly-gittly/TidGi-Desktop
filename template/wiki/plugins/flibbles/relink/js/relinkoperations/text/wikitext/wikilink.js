/*\
module-type: relinkwikitextrule

Handles CamelCase links

WikiLink

but not:

~WikiLink

\*/

var utils = require("./utils.js");
var prettylink = require('$:/plugins/flibbles/relink/js/relinkoperations/text/wikitext/prettylink.js');

exports.name = "wikilink";

function WikilinkEntry() {};
WikilinkEntry.prototype.name = "wikilink";
WikilinkEntry.prototype.report = function() {
	return [$tw.config.textPrimitives.unWikiLink + this.link];
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var entry = undefined;
	this.parser.pos = this.matchRegExp.lastIndex;
	if (this.match[0] === fromTitle && this.match[0][0] !== $tw.config.textPrimitives.unWikiLink) {
		entry = new WikilinkEntry();
		entry.link = fromTitle;
		entry.output = this.makeWikilink(toTitle, options);
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
		return prettylink.makeLink(title, undefined, options);
	}
};
