/*\
module-type: relinkwikitextrule

Handles code blocks. Or rather //doesn't// handle them, since we should
ignore their contents.

"`` [[Renamed Title]] ``" will remain unchanged.

\*/

exports.name = ["codeinline", "codeblock"];

exports.relink = function(text) {
	var reEnd;
	this.parser.pos = this.matchRegExp.lastIndex;
	// I'm lazy. This relink method works for both codeblock and codeinline
	if (this.match[0].length > 2) {
		// Must be a codeblock
		reEnd = /\r?\n```$/mg;
	} else {
		// Must be a codeinline
		reEnd = new RegExp(this.match[1], "mg");
	}
	reEnd.lastIndex = this.parser.pos;
	var match = reEnd.exec(text);
	if (match) {
		this.parser.pos = match.index + match[0].length;
	} else {
		this.parser.pos = this.parser.sourceLength;
	}
	return undefined;
};

// Same thing. Just skip the pos ahead.
exports.report = exports.relink;
