/*\
This specifies logic for updating filters to reflect title changes.
\*/

exports.name = "wikitext";

var type = 'text/vnd.tiddlywiki';

var WikiParser = require("$:/core/modules/parsers/wikiparser/wikiparser.js")[type];
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder.js");
var EntryNode = require('$:/plugins/flibbles/relink/js/utils/entry');

var WikitextEntry = EntryNode.newType("wikitext");

function collectRules() {
	var rules = Object.create(null);
	$tw.modules.forEachModuleOfType("relinkwikitextrule", function(title, exports) {
		var names = exports.name;
		if (typeof names === "string") {
			names = [names];
		}
		for (var i = 0; i < names.length; i++) {
			rules[names[i]] = exports;
		}
	});
	return rules;
}

function WikiRelinker(type, text, fromTitle, toTitle, options) {
	this.entry = new WikitextEntry();
	this.builder = new Rebuilder(text);
	this.options = options;
	if (!this.relinkMethodsInjected) {
		var rules = collectRules();
		$tw.utils.each([this.pragmaRuleClasses, this.blockRuleClasses, this.inlineRuleClasses], function(classList) {
			for (var name in classList) {
				if (rules[name]) {
					delete rules[name].name;
					$tw.utils.extend(classList[name].prototype, rules[name]);
				}
			}
		});
		WikiRelinker.prototype.relinkMethodsInjected = true;
	}
	this.fromTitle = fromTitle;
	this.toTitle = toTitle;
	WikiParser.call(this, type, text, options);
};

WikiRelinker.prototype = Object.create(WikiParser.prototype);

WikiRelinker.prototype.parsePragmas = function() {
	while (true) {
		this.skipWhitespace();
		if (this.pos >= this.sourceLength) {
			break;
		}
		var nextMatch = this.findNextMatch(this.pragmaRules, this.pos);
		if (!nextMatch || nextMatch.matchIndex !== this.pos) {
			break;
		}
		this.relinkRule(nextMatch);
	}
	return [];
};

WikiRelinker.prototype.parseInlineRunUnterminated = function(options) {
	var nextMatch = this.findNextMatch(this.inlineRules, this.pos);
	while (this.pos < this.sourceLength && nextMatch) {
		if (nextMatch.matchIndex > this.pos) {
			this.pos = nextMatch.matchIndex;
		}
		this.relinkRule(nextMatch);
		nextMatch = this.findNextMatch(this.inlineRules, this.pos);
	}
	this.pos = this.sourceLength;
};

WikiRelinker.prototype.parseInlineRunTerminated = function(terminatorRegExp,options) {
	options = options || {};
	terminatorRegExp.lastIndex = this.pos;
	var terminatorMatch = terminatorRegExp.exec(this.source);
	var inlineRuleMatch = this.findNextMatch(this.inlineRules,this.pos);
	while(this.pos < this.sourceLength && (terminatorMatch || inlineRuleMatch)) {
		if (terminatorMatch) {
			if (!inlineRuleMatch || inlineRuleMatch.matchIndex >= terminatorMatch.index) {
				this.pos = terminatorMatch.index;
				if (options.eatTerminator) {
					this.pos += terminatorMatch[0].length;
				}
				return [];
			}
		}
		if (inlineRuleMatch) {
			if (inlineRuleMatch.matchIndex > this.pos) {
				this.pos = inlineRuleMatch.matchIndex;
			}
			this.relinkRule(inlineRuleMatch);
			inlineRuleMatch = this.findNextMatch(this.inlineRules, this.pos);
			terminatorRegExp.lastIndex = this.pos;
			terminatorMatch = terminatorRegExp.exec(this.source);
		}
	}
	this.pos = this.sourceLength;
	return [];

};

WikiRelinker.prototype.parseBlock = function(terminatorRegExp) {
	var terminatorRegExp = /(\r?\n\r?\n)/mg;
	this.skipWhitespace();
	if (this.pos >= this.sourceLength) {
		return [];
	}
	var nextMatch = this.findNextMatch(this.blockRules, this.pos);
	if(nextMatch && nextMatch.matchIndex === this.pos) {
		return this.relinkRule(nextMatch);
	}
	return this.parseInlineRun(terminatorRegExp);
};

WikiRelinker.prototype.relinkRule = function(ruleInfo) {
	if (ruleInfo.rule.relink) {
		var newEntry = ruleInfo.rule.relink(this.source, this.fromTitle, this.toTitle, this.options);
		if (newEntry !== undefined) {
			this.entry.add(newEntry);
			if (newEntry.output) {
				this.builder.add(newEntry.output, ruleInfo.matchIndex, this.pos);
			}
		}
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

WikiRelinker.prototype.amendRules = function(type, names) {
	var only;
	WikiParser.prototype.amendRules.call(this, type, names);
	if (type === "only") {
		only = true;
	} else if (type === "except") {
		only = false;
	} else {
		return;
	}
	if (only !== (names.indexOf("macrodef") >= 0)) {
		this.options.placeholder = undefined
	}
	if (only !== (names.indexOf("html") >= 0)) {
		this.options.noWidgets = true;
	}
	if (only !== (names.indexOf("prettylink") >= 0)) {
		this.options.noPrettylinks = true;
	}
};

exports.relink = function(wikitext, fromTitle, toTitle, options) {
	// fromTitle doesn't even show up plaintext. No relinking to do.
	if (!options.settings.survey(wikitext, fromTitle, options)) {
		return undefined;
	}
	var matchingRule,
		newOptions = $tw.utils.extend({}, options);
	newOptions.settings = options.settings.createChildLibrary(options.currentTiddler);
	var parser = new WikiRelinker(options.type, wikitext, fromTitle, toTitle, newOptions);
	if (parser.entry.children.length > 0) {
		parser.entry.output = parser.builder.results();
		return parser.entry;
	}
	return undefined;
};
