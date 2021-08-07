/*\
module-type: relinkwikitextrule

Handles sys links

$:/sys/link

but not:

~$:/sys/link

\*/

var utils = require("./utils.js");

exports.name = "syslink";

exports.report = function(text, callback, options) {
	var title = this.match[0];
	this.parser.pos = this.matchRegExp.lastIndex;
	if (title[0] !== "~") {
		callback(title, '~' + title);
	}
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var entry = undefined;
	this.parser.pos = this.matchRegExp.lastIndex;
	if (this.match[0] === fromTitle && this.match[0][0] !== "~") {
		entry = {output: this.makeSyslink(toTitle, options)};
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
		return utils.makePrettylink(this.parser, title);
	}
};
