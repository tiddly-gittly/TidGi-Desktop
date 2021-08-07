/*\
module-type: relinkfieldtype
title: $:/plugins/flibbles/relink/js/fieldtypes/markdown.js
type: application/javascript

This relinks tiddlers which contain markdown. It tries to be agnostic to
whichever markdown plugin you're using.

\*/

var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder.js");
var wikitextHandler = require("$:/plugins/flibbles/relink/js/utils.js").getType('wikitext');
var utils = require("$:/plugins/flibbles/relink/js/utils/markdown.js");
var WikiParser = require("$:/core/modules/parsers/wikiparser/wikiparser.js")['text/vnd.tiddlywiki'];

function MarkdownWalker(text, options) {
	this.wiki = options.wiki;
	this.options = Object.create(options);
	this.options.macrodefCanBeDisabled = true;
	if(!this.mdInlineRuleClasses) {
		MarkdownWalker.prototype.mdInlineRuleClasses = $tw.modules.createClassesFromModules("relinkmarkdownrule","inline",$tw.MarkdownRuleBase);
	}
	if(!this.mdBlockRuleClasses) {
		MarkdownWalker.prototype.mdBlockRuleClasses = $tw.modules.createClassesFromModules("relinkmarkdownrule","block",$tw.MarkdownRuleBase);
	}
	this.source = text || "";
	this.sourceLength = this.source.length;
	// Set current parse position
	this.pos = 0;
	// Instantiate the parser block and inline rules
	this.blockRules = this.instantiateRules(this.mdBlockRuleClasses,"block",0);
	this.inlineRules = this.instantiateRules(this.mdInlineRuleClasses,"inline",0);
	// instantiateRules first with indent==undefined so we can match regardless
	// of tabdepth. Now we need to be strict about it.
	this.indent = 0;
	this.parseBlocks();
};

MarkdownWalker.prototype = Object.create(WikiParser.prototype);

module.exports

MarkdownWalker.prototype.parseBlock = function(terminatorRegExpString) {
	var terminatorRegExp = /([^\S\n]*\r?\n)/mg;
	this.skipEmptyLines();
	if(this.pos >= this.sourceLength) {
		return [];
	}
	// Look for a block rule that applies at the current position
	var nextMatch = this.findNextMatch(this.blockRules, this.pos);
	if(nextMatch && nextMatch.matchIndex === this.pos) {
		return this.handleRule(nextMatch);
	}
	return this.parseInlineRun(terminatorRegExp);
};

MarkdownWalker.prototype.parseInlineRunTerminated = function(terminatorRegExp,options) {
	options = options || {};
	var tree = [];
	// Find the next occurrence of the terminator
	terminatorRegExp.lastIndex = this.pos;
	var terminatorMatch = terminatorRegExp.exec(this.source);
	// Find the next occurrence of a inlinerule
	var inlineRuleMatch = this.findNextMatch(this.inlineRules,this.pos);
	// Loop around until we've reached the end of the text
	while(this.pos < this.sourceLength && (terminatorMatch || inlineRuleMatch)) {
		// Return if we've found the terminator, and it precedes any inline rule match
		if(terminatorMatch) {
			if(!inlineRuleMatch || inlineRuleMatch.matchIndex >= terminatorMatch.index) {
				this.handleWikitext(this.pos, terminatorMatch.index);
				//if(options.eatTerminator) {
					this.pos += terminatorMatch[0].length;
				//}
				return tree;
			}
		}
		// Process any inline rule, along with the text preceding it
		if(inlineRuleMatch) {
			// Preceding text
			this.handleWikitext(this.pos, inlineRuleMatch.matchIndex);
			this.handleRule(inlineRuleMatch);
			// Look for the next inline rule
			inlineRuleMatch = this.findNextMatch(this.inlineRules,this.pos);
			// Look for the next terminator match
			terminatorRegExp.lastIndex = this.pos;
			terminatorMatch = terminatorRegExp.exec(this.source);
		}
	}
	// Process the remaining text
	this.handleWikitext(this.pos, this.sourceLength);
	return tree;
};

MarkdownWalker.prototype.skipEmptyLines = function() {
	var emptyRegExp = /(?:[^\S\n]*\n)+/mg;
	emptyRegExp.lastIndex = this.pos;
	var emptyMatch = emptyRegExp.exec(this.source);
	if(emptyMatch && emptyMatch.index === this.pos) {
		this.pos = emptyRegExp.lastIndex;
	}
};

function MarkdownReporter(text, callback, options) {
	this.callback = callback;
	MarkdownWalker.call(this, text, options);
};

MarkdownReporter.prototype = Object.create(MarkdownWalker.prototype);

MarkdownReporter.prototype.handleRule = function(ruleInfo) {
	if (ruleInfo.rule.report) {
		ruleInfo.rule.report(this.source, this.callback, this.options);
	} else {
		if (ruleInfo.rule.matchRegExp !== undefined) {
			this.pos = ruleInfo.rule.matchRegExp.lastIndex;
		} else {
			// We can't easily determine the end of this
			// rule match. We'll "parse" it so that
			// parser.pos gets updated, but we throw away
			// the results.
			ruleInfo.rule.parse();
		}
	}
};

MarkdownReporter.prototype.handleWikitext = function(startPos, end) {
	if (startPos < end) {
		var config = utils.getSettings(this.wiki);
		if (config.wikitext) {
			var substr = this.source.substring(this.pos, end);

			var pragma = config.wikitextPragma;
			var wikiEntry = wikitextHandler.report(pragma + substr, this.callback, this.options);
		}
	}
	this.pos = end;
};

exports.report = function(markdowntext, callback, options) {
	new MarkdownReporter(markdowntext, callback, options);
};

function MarkdownRelinker(text, fromTitle, toTitle, options) {
	this.fromTitle = fromTitle;
	this.toTitle = toTitle;
	this.builder = new Rebuilder(text);
	MarkdownWalker.call(this, text, options);
};

MarkdownRelinker.prototype = Object.create(MarkdownWalker.prototype);

MarkdownRelinker.prototype.handleRule = function(ruleInfo) {
	var newEntry = ruleInfo.rule.relink(this.source, this.fromTitle, this.toTitle, this.options);
	if (newEntry !== undefined) {
		if (newEntry.impossible) {
			this.impossible = true;
		}
		if (newEntry.output) {
			this.builder.add(newEntry.output, ruleInfo.matchIndex, this.pos);
		}
	}
};

MarkdownRelinker.prototype.handleWikitext = function(startPos, end) {
	if (startPos < end) {
		var config = utils.getSettings(this.wiki);
		if (config.wikitext) {
			var substr = this.source.substring(this.pos, end);

			var pragma = config.wikitextPragma;
			var wikiEntry = wikitextHandler.relink(pragma + substr, this.fromTitle, this.toTitle, this.options);
			if (wikiEntry != undefined) {
				if (wikiEntry.impossible) {
					this.impossible = true;
				}
				if (wikiEntry.output) {
					this.builder.add(wikiEntry.output.slice(pragma.length), startPos, end);
				}
			}
		}
	}
	this.pos = end;
};

exports.name = "markdown";

exports.relink = function(markdowntext, fromTitle, toTitle, options) {
	var relinker = new MarkdownRelinker(markdowntext, fromTitle, toTitle, options),
		entry;
	if (relinker.builder.changed() || relinker.impossible) {
		entry = {
			output: relinker.builder.results(),
			impossible: relinker.impossible };
	}
	return entry;
};
