/*\
module-type: relinkwikitextrule

Parses and acknowledges any pragma rules a tiddler has.

\rules except html wikilink

\*/

exports.name = "rules";

/**This is all we have to do. The rules rule doesn't parse. It just amends
 * the rules, which is exactly what I want it to do too.
 * It also takes care of moving the pos pointer forward.
 */
exports.relink = function() {
	this.parse();
	return undefined;
};

// Same deal
exports.report = exports.relink;
