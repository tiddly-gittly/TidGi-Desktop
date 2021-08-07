/*\
module-type: wikimethod

Introduces some utility methods used by Relink.

\*/

var utils = require("./utils.js");

exports.getTiddlerRelinkReferences = function(title) {
	return utils.getIndexer(this).lookup(title);
};

exports.getTiddlerRelinkBackreferences = function(title) {
	return utils.getIndexer(this).reverseLookup(title);
};

exports.getRelinkableTitles = function() {
	var toUpdate = "$:/config/flibbles/relink/to-update";
	var wiki = this;
	return this.getCacheForTiddler(toUpdate, "relink-toUpdate", function() {
		var tiddler = wiki.getTiddler(toUpdate);
		if (tiddler) {
			return wiki.compileFilter(tiddler.fields.text);
		} else {
			return wiki.allTitles;
		}
	})();
};
