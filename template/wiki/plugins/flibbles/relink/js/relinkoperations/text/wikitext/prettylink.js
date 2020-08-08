/*\
module-type: relinkwikitextrule

Handles replacement in wiki text inline rules, like,

[[Introduction]]

[[link description|TiddlerTitle]]

\*/

var utils = require("./utils.js");

function PrettyLinkEntry() {};
PrettyLinkEntry.prototype.name = "prettylink";
PrettyLinkEntry.prototype.report = function() {
	return ["[[" + (this.caption || this.link) + "]]"];
};

exports.name = "prettylink";

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
	var entry = new PrettyLinkEntry();
	entry.caption = caption;
	entry.link = toTitle;
	entry.output = this.makeLink(toTitle, caption, options);
	if (entry.output === undefined) {
		entry.impossible = true;
	}
	return entry;
};

exports.makeLink = function(tiddler, caption, options) {
	var output, quoted;
	if (!options.noPrettylinks && this.canBePretty(tiddler, !!caption)) {
		output = prettyLink(tiddler, caption);
	} else if (options.noWidgets) {
		// We aren't allowed to make widgets. Gotta fail.
		output = undefined;
	} else if (caption === undefined) {
		if (exports.shorthandSupported(options)) {
			quoted = utils.wrapAttributeValue(tiddler);
			if (!quoted) {
				if (!options.placeholder) {
					return undefined;
				}
				quoted = "<<" + options.placeholder.getPlaceholderFor(tiddler,undefined,options) + ">>";
			}
			output = "<$link to="+quoted+"/>";
		} else {
			// If we don't have a caption, we must resort to
			// placeholders anyway to prevent link/caption desync
			// from later relinks.
			// It doesn't matter whether the tiddler is quotable.
			if (options.placeholder) {
				var ph = options.placeholder.getPlaceholderFor(tiddler, undefined, options);
				output = "<$link to=<<"+ph+">>><$text text=<<"+ph+">>/></$link>";
			}
		}
	} else if (quoted = utils.wrapAttributeValue(tiddler)) {
		var safeCaption = sanitizeCaption(caption, options);
		if (safeCaption !== undefined) {
			output = "<$link to="+quoted+">"+safeCaption+"</$link>";
		}
	} else if (options.placeholder) {
		var ph = options.placeholder.getPlaceholderFor(tiddler, undefined, options);
		// We don't test if caption is undefined here, because it
		// never will be. options.placeholder exists.
		var safeCaption = sanitizeCaption(caption, options);
		output = "<$link to=<<"+ph+">>>"+safeCaption+"</$link>";
	}
	return output;
};

/**Return true if value can be used inside a prettylink.
 */
exports.canBePretty = function(value, customCaption) {
	return value.indexOf("]]") < 0 && value[value.length-1] !== ']' && (customCaption || value.indexOf('|') < 0);
};

/**In version 5.1.20, Tiddlywiki made it so <$link to"something" /> would
 * use "something" as a caption. This is preferable. However, Relink works
 * going back to 5.1.14, so we need to have different handling for both
 * cases.
 */
var _supported;
exports.shorthandSupported = function(options) {
	if (_supported === undefined) {
		var test = options.wiki.renderText("text/plain", "text/vnd.tiddlywiki", "<$link to=test/>");
		_supported = (test === "test");
	}
	return _supported;
};

function sanitizeCaption(caption, options) {
	var plaintext = options.wiki.renderText("text/plain", "text/vnd.tiddlywiki", caption);
	if (plaintext === caption && caption.indexOf("</$link>") <= 0) {
		return caption;
	} else {
		var wrapped = utils.wrapAttributeValue(caption);
		if (wrapped) {
			return "<$text text="+wrapped+"/>";
		} else if (options.placeholder) {
			var ph = options.placeholder.getPlaceholderFor(caption, "caption", options);
			return "<$text text=<<"+ph+">>/>";
		} else {
			return undefined;
		}
	}
};

function prettyLink(title, caption) {
	if (caption) {
		return "[[" + caption + "|" + title + "]]";
	} else {
		return "[[" + title + "]]";
	}
};
