/*\
module-type: relinkwikitextrule

Handles comment blocks. Or rather //doesn't// handle them, since we should
ignore their contents.

"<!-- [[Renamed Title]] -->" will remain unchanged.

\*/

exports.name = ["commentinline", "commentblock"];

exports.relink = function(text, fromTitle, toTitle, options) {
	this.parser.pos = this.endMatchRegExp.lastIndex;
	return undefined;
};
