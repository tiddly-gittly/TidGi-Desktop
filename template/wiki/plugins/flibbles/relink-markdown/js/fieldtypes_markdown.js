/*\
module-type: relinkfieldtype
title: $:/plugins/flibbles/relink/js/fieldtypes/markdown.js
type: application/javascript

This relinks tiddlers which contain markdown. It tries to be agnostic to
whichever markdown plugin you're using.

\*/

var EntryNode = require('$:/plugins/flibbles/relink/js/utils/entry');
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder.js");
var utils = require("$:/plugins/flibbles/relink/js/utils/markdown.js");
var WikiParser = require("$:/core/modules/parsers/wikiparser/wikiparser.js")['text/vnd.tiddlywiki'];

var MarkdownEntry = EntryNode.newType("markdown");

function MarkdownRelinker(text, fromTitle, toTitle, options) {
	this.wiki = options.wiki;
	this.entry = new MarkdownEntry();
	this.builder = new Rebuilder(text);
	this.fromTitle = fromTitle;
	this.toTitle = toTitle;
	this.options = options;
	if(!this.mdInlineRuleClasses) {
		MarkdownRelinker.prototype.mdInlineRuleClasses = $tw.modules.createClassesFromModules("relinkmarkdownrule","inline",$tw.MarkdownRuleBase);
	}
	if(!this.mdBlockRuleClasses) {
		MarkdownRelinker.prototype.mdBlockRuleClasses = $tw.modules.createClassesFromModules("relinkmarkdownrule","block",$tw.MarkdownRuleBase);
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

MarkdownRelinker.prototype = Object.create(WikiParser.prototype);

module.exports

MarkdownRelinker.prototype.parseBlock = function(terminatorRegExpString) {
	var terminatorRegExp = /([^\S\n]*\r?\n)/mg;
	this.skipEmptyLines();
	if(this.pos >= this.sourceLength) {
		return [];
	}
	// Look for a block rule that applies at the current position
	var nextMatch = this.findNextMatch(this.blockRules, this.pos);
	if(nextMatch && nextMatch.matchIndex === this.pos) {
		return this.relinkRule(nextMatch);
	}
	return this.parseInlineRun(terminatorRegExp);
};

MarkdownRelinker.prototype.relinkRule = function(ruleInfo) {
	var newEntry = ruleInfo.rule.relink(this.source, this.fromTitle, this.toTitle, this.options);
	if (newEntry !== undefined) {
		this.entry.add(newEntry);
		if (newEntry.output) {
			this.builder.add(newEntry.output, ruleInfo.matchIndex, this.pos);
		}
	}
};

MarkdownRelinker.prototype.parseInlineRunTerminated = function(terminatorRegExp,options) {
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
				this.relinkWikitext(this.pos, terminatorMatch.index);
				//if(options.eatTerminator) {
					this.pos += terminatorMatch[0].length;
				//}
				return tree;
			}
		}
		// Process any inline rule, along with the text preceding it
		if(inlineRuleMatch) {
			// Preceding text
			this.relinkWikitext(this.pos, inlineRuleMatch.matchIndex);
			this.relinkRule(inlineRuleMatch);
			// Look for the next inline rule
			inlineRuleMatch = this.findNextMatch(this.inlineRules,this.pos);
			// Look for the next terminator match
			terminatorRegExp.lastIndex = this.pos;
			terminatorMatch = terminatorRegExp.exec(this.source);
		}
	}
	// Process the remaining text
	this.relinkWikitext(this.pos, this.sourceLength);
	return tree;
};

MarkdownRelinker.prototype.skipEmptyLines = function() {
	var emptyRegExp = /(?:[^\S\n]*\n)+/mg;
	emptyRegExp.lastIndex = this.pos;
	var emptyMatch = emptyRegExp.exec(this.source);
	if(emptyMatch && emptyMatch.index === this.pos) {
		this.pos = emptyRegExp.lastIndex;
	}
};

MarkdownRelinker.prototype.relinkWikitext = function(startPos, end) {
	if (startPos < end) {
		var config = utils.getSettings(this.wiki);
		if (config.wikitext) {
			var substr = this.source.substring(this.pos, end);

			var pragma = config.wikitextPragma;
			var wikitextHandler = this.options.settings.getType('wikitext');
			var wikiEntry = wikitextHandler.relink(pragma + substr, this.fromTitle, this.toTitle, this.options);
			if (wikiEntry != undefined) {
				this.entry.add(wikiEntry);
				if (wikiEntry.output) {
					this.builder.add(wikiEntry.output.slice(pragma.length), startPos, end);
				}
			}
		}
	}
	this.pos = end;
}

exports.name = "markdown";

exports.relink = function(markdowntext, fromTitle, toTitle, options) {
	var relinker = new MarkdownRelinker(markdowntext, fromTitle, toTitle, options);
	var entry = relinker.entry;
	if (entry.children.length > 0) {
		entry.output = relinker.builder.results();
		return entry;
	}
	return undefined;
};
