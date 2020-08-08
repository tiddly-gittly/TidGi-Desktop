/*\
module-type: relinkwikitextrule

Handles sys links

$:/sys/link

but not:

~$:/sys/link

\*/

var utils = require("./utils.js");
var prettylink = require('$:/plugins/flibbles/relink/js/relinkoperations/text/wikitext/prettylink.js');

exports.name = "syslink";

function SyslinkEntry() {};
SyslinkEntry.prototype.name = "syslink";
SyslinkEntry.prototype.report = function() {
	return ["~" + this.link];
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var entry = undefined;
	this.parser.pos = this.matchRegExp.lastIndex;
	if (this.match[0] === fromTitle && this.match[0][0] !== "~") {
		entry = new SyslinkEntry();
		entry.link = fromTitle;
		entry.output = this.makeSyslink(toTitle, options);
		if (entry.output === undefined) {
			entry.impossible = true;
		}
	}
	return entry;
};

exports.makeSyslink = function(title, options) {
	var match = title.match(this.matchRegExp);
	if (match && match[0] === title && title[0] !== "~") {
		return title;
	} else {
		return prettylink.makeLink(title, undefined, options);
	}
};
