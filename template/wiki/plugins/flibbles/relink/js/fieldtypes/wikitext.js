/*\
This specifies logic for updating filters to reflect title changes.
\*/

exports.name = "wikitext";

var type = 'text/vnd.tiddlywiki';

var WikiParser = require("$:/core/modules/parsers/wikiparser/wikiparser.js")[type];
var Rebuilder = require("$:/plugins/flibbles/relink/js/utils/rebuilder.js");
var utils = require('$:/plugins/flibbles/relink/js/utils');
var WikitextContext = utils.getContext('wikitext');

function collectRules() {
	var rules = Object.create(null);
	$tw.modules.forEachModuleOfType("relinkwikitextrule", function(title, exports) {
		var names = exports.name;
		if (typeof names === "string") {
			names = [names];
		}
		if (names !== undefined) {
			for (var i = 0; i < names.length; i++) {
				rules[names[i]] = exports;
			}
		}
	});
	return rules;
}

function WikiWalker(type, text, options) {
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
		WikiWalker.prototype.relinkMethodsInjected = true;
	}
	this.context = new WikitextContext(options.settings);
	WikiParser.call(this, type, text, options);
};

WikiWalker.prototype = Object.create(WikiParser.prototype);

WikiWalker.prototype.parsePragmas = function() {
	var entries = this.tree;
	while (true) {
		this.skipWhitespace();
		if (this.pos >= this.sourceLength) {
			break;
		}
		var nextMatch = this.findNextMatch(this.pragmaRules, this.pos);
		if (!nextMatch || nextMatch.matchIndex !== this.pos) {
			break;
		}
		entries.push.apply(entries, this.handleRule(nextMatch));
	}
	return entries;
};

WikiWalker.prototype.parseInlineRunUnterminated = function(options) {
	var entries = [];
	var nextMatch = this.findNextMatch(this.inlineRules, this.pos);
	while (this.pos < this.sourceLength && nextMatch) {
		if (nextMatch.matchIndex > this.pos) {
			this.pos = nextMatch.matchIndex;
		}
		entries.push.apply(entries, this.handleRule(nextMatch));
		nextMatch = this.findNextMatch(this.inlineRules, this.pos);
	}
	this.pos = this.sourceLength;
	return entries;
};

WikiWalker.prototype.parseInlineRunTerminated = function(terminatorRegExp,options) {
	var entries = [];
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
				return entries;
			}
		}
		if (inlineRuleMatch) {
			if (inlineRuleMatch.matchIndex > this.pos) {
				this.pos = inlineRuleMatch.matchIndex;
			}
			entries.push.apply(entries, this.handleRule(inlineRuleMatch));
			inlineRuleMatch = this.findNextMatch(this.inlineRules, this.pos);
			terminatorRegExp.lastIndex = this.pos;
			terminatorMatch = terminatorRegExp.exec(this.source);
		}
	}
	this.pos = this.sourceLength;
	return entries;

};

WikiWalker.prototype.parseBlock = function(terminatorRegExp) {
	var terminatorRegExp = /(\r?\n\r?\n)/mg;
	this.skipWhitespace();
	if (this.pos >= this.sourceLength) {
		return [];
	}
	var nextMatch = this.findNextMatch(this.blockRules, this.pos);
	if(nextMatch && nextMatch.matchIndex === this.pos) {
		return this.handleRule(nextMatch);
	}
	return this.parseInlineRun(terminatorRegExp);
};

WikiWalker.prototype.amendRules = function(type, names) {
	var only;
	WikiParser.prototype.amendRules.call(this, type, names);
	if (type === "only") {
		only = true;
	} else if (type === "except") {
		only = false;
	} else {
		return;
	}
	if (only !== (names.indexOf("macrodef") >= 0) && this.options.macrodefCanBeDisabled) {
		this.options.placeholder = undefined
	}
	if (only !== (names.indexOf("html") >= 0)) {
		this.context.allowWidgets = disabled;
	}
	if (only !== (names.indexOf("prettylink") >= 0)) {
		this.context.allowPrettylinks = disabled;
	}
};

function disabled() { return false; };

/// Reporter

function WikiReporter(type, text, callback, options) {
	this.callback = callback;
	WikiWalker.call(this, type, text, options);
};

WikiReporter.prototype = Object.create(WikiWalker.prototype);

WikiReporter.prototype.handleRule = function(ruleInfo) {
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

exports.report = function(wikitext, callback, options) {
	// Unfortunately it's the side-effect of creating this that reports.
	new WikiReporter(options.type, wikitext, callback, options);
};

/// Relinker

function WikiRelinker(type, text, fromTitle, toTitle, options) {
	this.fromTitle = fromTitle;
	this.toTitle = toTitle;
	this.placeholder = options.placeholder;
	if (this.placeholder) {
		this.placeholder.parser = this;
	}
	WikiWalker.call(this, type, text, options);
};

WikiRelinker.prototype = Object.create(WikiWalker.prototype);

WikiRelinker.prototype.handleRule = function(ruleInfo) {
	if (ruleInfo.rule.relink) {
		var start = ruleInfo.matchIndex;
		var newEntry = ruleInfo.rule.relink(this.source, this.fromTitle, this.toTitle, this.options);
		if (newEntry !== undefined) {
			if (newEntry.output) {
				newEntry.start = start;
				newEntry.end = this.pos;
			}
			return [newEntry];
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
	return [];
};

exports.relink = function(wikitext, fromTitle, toTitle, options) {
	var parser = new WikiRelinker(options.type, wikitext, fromTitle, toTitle, options),
		wikiEntry = undefined;
	// Now that we have an array of entries, let's produce the wikiText entry
	// containing them all.
	if (parser.tree.length > 0) {
		var builder = new Rebuilder(wikitext);
		wikiEntry = {};
		for (var i = 0; i < parser.tree.length; i++) {
			var entry = parser.tree[i];
			if (entry.impossible) {
				wikiEntry.impossible = true;
			}
			if (entry.output) {
				builder.add(entry.output, entry.start, entry.end);
			}
		}
		wikiEntry.output = builder.results();
	}
	return wikiEntry;
};
