/*\
module-type: relinkmarkdownrule
title: $:/plugins/flibbles/relink/js/relinkoperations/text/markdowntext/link.js
type: application/javascript

Handles markdown links

[caption](#link)

\*/

var utils = require("$:/plugins/flibbles/relink/js/utils/markdown");
var markdown = require("$:/plugins/flibbles/relink/js/utils").getType('markdown');

exports.name = "markdownlink";
exports.types = {inline: true};

exports.init = function(parser) {
	this.parser = parser;
};

exports.findNextMatch = function(startPos) {
	this.endMatch = this.matchLink(this.parser.source, startPos);
	return this.endMatch ? this.endMatch.index : undefined;
};

/**A zero side-effect method which returns a regexp which pretended to match
 * the whole link, caption and all. I do this instead of just using a
 * regexp to begin with, because markdown links require context-free grammar
 * matching.
 * Currently, it doesn't properly set match[0]. No need as of yet.
 * 1. "!"
 * 2. caption
 * 3. "\s*#?"
 * 4. "link"
 * 5. "\s*'tooltip'"
 */
exports.matchLink = function(text, pos) {
	pos = pos-1;
	var match = undefined;
	do {
		pos = text.indexOf('[', pos+1);
		if (pos < 0) {
			return undefined;
		}
		var caption = this.getEnclosed(text, pos, '[', ']');
		if (caption === undefined) {
			continue;
		}
		var linkStart = pos + caption.length+2;
		if (text.charAt(linkStart) !== '(') {
			continue;
		}
		// match[1] and match[2] are the "!" and "caption", filled in later.
		var regExp = /\(()()(\s*#?)((?:[^\s\(\)]|\([^\s\(\)]*\))+)((?:\s+(?:'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|\([^)]*\)))?\s*)\)/g;
		regExp.lastIndex = linkStart;
		match = regExp.exec(text);
		if (match && match.index === linkStart && utils.indexOfParagraph(match[0]) < 0) {
			match[2] = caption;
			if (text.charAt(pos-1) === "!") {
				match.index = pos-1;
				match[1] = "!";
			} else {
				match.index = pos;
			}
		} else {
			match = undefined;
		}
	} while (!match);
	return match;
};

exports.report = function(text, callback, options) {
	var em = this.endMatch,
		caption = em[2],
		prefix = em[1],
		isImage = (prefix === '!'),
		link = em[4],
		hash = '#';
	if (prefix) {
		hash = '';
	}
	this.parser.pos = em.index + em[1].length + caption.length + em[0].length + 2;
	if (!isImage) {
		markdown.report(caption, function(title, blurb) {
			callback(title, prefix + '[' + (blurb || '') + '](' + hash + link + ')');
		}, options);
	}
	if (isImage !== (em[3].lastIndexOf('#') >= 0)) {
		var safeCaption = utils.abridge(caption);
		try {
			callback(decodeURIComponent(link), em[1] + '[' + safeCaption + '](' + hash + ')');
		} catch (e) {
			// It must be a malformed link. Not our problem.
			// Just move on.
		}
	}
};

exports.relink = function(text, fromTitle, toTitle, options) {
	var entry = {},
		em = this.endMatch,
		modified = false,
		caption = em[2],
		isImage = (em[1] === '!'),
		link = em[4];
	this.parser.pos = em.index + em[1].length + caption.length + em[0].length + 2;
	if (!isImage) {
		var newCaption = markdown.relink(caption, fromTitle, toTitle, options);
		if (newCaption) {
			if (newCaption.output) {
				if (this.canBeCaption(newCaption.output)) {
					caption = newCaption.output;
					modified = true;
				} else {
					entry.impossible = true;
				}
			}
			if (newCaption.impossible) {
				entry.impossible = true;
			}
		}
	}
	// I don't know why internal images links don't use the '#', but links
	// do, but that's just how it is.
	if (isImage !== (em[3].lastIndexOf('#') >=0)) {
		try {
			if (decodeURIComponent(link) === fromTitle) {
				link = utils.encodeLink(toTitle);
				modified = true;
			}
		} catch (e) {
			// It must be a malformed link. Not our problem.
			// Keep going in case the caption needs relinking.
		}
	}
	if (modified) {
		// This way preserves whitespace
		entry.output = em[1]+"["+caption+"]("+em[3]+link+em[5]+")";
	}
	if (modified || entry.impossible) {
		return entry;
	}
	return undefined;
};

exports.canBeCaption = function(caption) {
	return this.indexOfClose(caption+']', -1, '[', ']') === caption.length;
};

exports.getEnclosed = function(text, pos, openChar, closeChar) {
	var capEnd = this.indexOfClose(text, pos, openChar, closeChar);
	if (capEnd < 0) {
		return undefined;
	}
	var enclosed = text.substring(pos+1, capEnd);
	if (enclosed.match(/\n\s*\n/)) {
		// Paragraph breaks are not allowed
		return undefined;
	}
	return enclosed;
};

exports.indexOfClose = function(text, pos, openChar, closeChar) {
	var close = pos-1,
		open = pos; // First char is open
	do {
		close = text.indexOf(closeChar, close+1);
		if (close < 0) {
			return -1;
		}
		open = text.indexOf(openChar, open+1);
	} while (open >= 0 && open <= close);
	return close;
};
