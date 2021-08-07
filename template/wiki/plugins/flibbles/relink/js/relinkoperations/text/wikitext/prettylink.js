/*\
module-type: relinkwikitextrule

Handles replacement in wiki text inline rules, like,

[[Introduction]]

[[link description|TiddlerTitle]]

\*/

var utils = require("./utils.js");

exports.name = "prettylink";

exports.report = function(text, callback, options) {
	var text = this.match[1],
		link = this.match[2] || text;
	if (!$tw.utils.isLinkExternal(link)) {
		callback(link, '[[' + text + ']]');
	}
	this.parser.pos = this.matchRegExp.lastIndex;
};

exports.relink = function(text, fromTitle, toTitle, options) {
	this.parser.pos = this.matchRegExp.lastIndex;
	var caption, m = this.match;
	if (m[2] === fromTitle) {
		// format is [[caption|MyTiddler]]
		caption = m[1];
	} else if (m[2] !== undefined || m[1] !== fromTitle) {
		// format is [[MyTiddler]], and it doesn't match
		return undefined;
	}
	var entry = { output: utils.makePrettylink(this.parser, toTitle, caption) };
	if (entry.output === undefined) {
		entry.impossible = true;
	}
	return entry;
};
