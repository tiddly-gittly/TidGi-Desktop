/*\
module-type: library
title: $:/plugins/flibbles/relink/js/utils/markdown.js
type: application/javascript

Methods used in markdown parsing.

\*/

// tiddlywiki/markdown can't handle having these characters escaped, so we
// need to unescape them.
var problemChars = {
	"23": "#",
	"24": "$",
	"26": "&",
	"2B": "+",
	"2C": ",",
	"2F": "/",
	"3A": ":",
	"3B": ";",
	"3D": "=",
	"3F": "?",
	"40": "@",
};

exports.encodeLink = function(title) {
	var encoded = encodeURIComponent(title),
		balance = 0;
	encoded = encoded.replace(/[\(\)]/g, function(p) {
		if (p === '(') {
			if (balance >=1) {
				return '%28';
			} else {
				balance++;
			}
		} else {
			if (balance <= 0) {
				return '%29';
			}
			balance--;
		}
		return p;
	});
	while (balance--) {
		var i = encoded.lastIndexOf('(');
		encoded = encoded.substr(0, i) + '%28' + encoded.substr(i+1);
	}
	// tiddlywiki/markdown can't handle these characters escaped
	return encoded.replace(/%([0-9A-F]{2})/g, function(str, code) {
		return problemChars[code] || str;
	});
};

// Returns index of next paragraph, or -1
exports.indexOfParagraph = function(text, startPos) {
	var regExp = /\n\s*\n/mg;
	regExp.lastIndex = startPos || 0;
	var match = regExp.exec(text);
	return match ? regExp.lastIndex : -1;
};

/** Returns how much indentation there is between pos and the previous
 * newline (or other char).
 * tabs are counted as 4 chars.
 */
exports.indentation = function(text, pos, startChar) {
	var p = text.lastIndexOf(startChar || '\n', pos-1);
	var count = 0;
	while (++p < pos) {
		var c = text.charAt(p);
		if (c === ' ') {
			count++;
		} else if (c === '\t') {
			count = count + 4 - (count%4);
		} else {
			return -1;
		}
	}
	return count;
};


exports.getSettings = function(wiki) {
	// Stored here so it's only calculated once, but also so it's different
	// per tiddler for testing
	if (wiki._markdownSettings === undefined) {
		var settings = Object.create(null);
		var text = wiki.getTiddlerText("$:/config/markdown/renderWikiText");
		settings.wikitext =  (text === undefined || text.toLowerCase() === "true");
		text = wiki.getTiddlerText("$:/config/markdown/renderWikiTextPragma");
		if (text) {
			text = text.trim() + '\n';
		} else {
			text = '';
		}
		settings.wikitextPragma = text;
		wiki._markdownSettings = settings;
	}
	return wiki._markdownSettings;
};

// This is the maximum length a reported caption may be
exports.captionLength = 15;

/** Abridges a string to one that is more log-friendly.
 */
exports.abridge = function(string) {
	var safe = string.replace(/\s+/mg, ' ');
	if (safe.length > this.captionLength) {
		safe = safe.substr(0, this.captionLength) + "...";
	}
	return safe;
};

/**I don't actually use this, but I've kept the code around anyway.
 * The only time this plugin is installed and markdown isn't enabled would
 * be if the user forgot to install a markdown plugin, or they disabled it.
 * I GUESS Relink should still be Relinking markdown in that case.
 */
exports.markdownEnabled = function() {
	if (_enabled === undefined) {
		var test = $tw.wiki.renderText("text/html", "text/x-markdown", "[test](#test)");
		_enabled = (test.indexOf("<a") >= 0);
	}
	return _enabled;
};
var _enabled;
