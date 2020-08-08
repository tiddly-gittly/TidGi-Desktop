/*\
title: $:/plugins/bimlas/kin-filter/kin.js
type: application/javascript
module-type: filteroperator

Finds out where a tiddler originates from and what other tiddlers originate from it

\*/
(function() {

	/*jslint node: true, browser: true */
	/*global $tw: true */
	"use strict";

	function collectTitlesRecursively(baseTiddler,baseTitle,options) {
		var cacheName = "kin-filter-" + baseTitle + "-" + options.fieldName + "-",
			titlesPointingFromBase = {},
			titlesPointingToBase = {},
			resultsFrom = [],
			resultsTo = [];

		/* Copy of findListingsOfTiddler, but it's searching in shadows as well. */
		function findListingsOfTiddler(targetTitle,fieldName) {
			fieldName = fieldName || "list";
			var titles = [];
			options.wiki.eachTiddlerPlusShadows(function(tiddler,title) {
				var list = $tw.utils.parseStringArray(tiddler.fields[fieldName]);
				if(list && list.indexOf(targetTitle) !== -1) {
					titles.push(title);
				}
			});
			return titles;
		}

		function addToResultsIfNotFoundAlready(alreadyFound,title,depth) {
			if(title in alreadyFound) {
				return false;
			}
			alreadyFound[title] = depth;
			return true
		}

		function collectTitlesPointingFrom(tiddler,title,currentDepth) {
			if(addToResultsIfNotFoundAlready(titlesPointingFromBase,title,currentDepth)) {
				currentDepth += 1;
				if(tiddler) {
					$tw.utils.each(tiddler.getFieldList(options.fieldName),function(targetTitle) {
						collectTitlesPointingFrom(options.wiki.getTiddler(targetTitle),targetTitle,currentDepth);
					});
				}
			}
		}

		function collectTitlesPointingTo(title,currentDepth) {
			if(addToResultsIfNotFoundAlready(titlesPointingToBase,title,currentDepth)) {
				currentDepth += 1;
				$tw.utils.each(findListingsOfTiddler(title,options.fieldName),function(targetTitle) {
					collectTitlesPointingTo(targetTitle,currentDepth);
				});
			}
		}

		function getObjectKeysByExpression(object,callback) {
			var key,
				results = [];
			for (key in object) {
				if (object.hasOwnProperty(key) && callback(object[key])) {
					results.push(key);
				}
			}
			return results;
		}

		function getResultsInGivenDepth(cachedData) {
			if(options.depth) {
				return getObjectKeysByExpression(cachedData,function(value) {
					return value <= options.depth;
				})
			} else {
				return Object.keys(cachedData);
			}
		}

		if((options.direction === "from") || (options.direction === "with")) {
			resultsFrom = $tw.wiki.getGlobalCache(cacheName + "from",function() {
				collectTitlesPointingFrom(baseTiddler,baseTitle,0);
				return titlesPointingFromBase;
			});
			resultsFrom = getResultsInGivenDepth(resultsFrom);
		}
		if((options.direction === "to") || (options.direction === "with")) {
			resultsTo = $tw.wiki.getGlobalCache(cacheName + "to",function() {
				collectTitlesPointingTo(baseTitle,0);
				return titlesPointingToBase;
			});
			resultsTo = getResultsInGivenDepth(resultsTo);
		}
		return $tw.utils.pushTop(resultsFrom,resultsTo);
	}

	/*
	Export our filter function
	*/
	exports.kin = function(source,operator,options) {
		var results = [],
			needsExclusion = operator.prefix === "!",
			suffixes = operator.suffixes || [],
			filterOptions = {
				wiki: options.wiki,
				fieldName: ((suffixes[0] || [])[0] || "tags").toLowerCase(),
				direction: ((suffixes[1] || [])[0] || "with").toLowerCase(),
				depth: Number((suffixes[2] || [])[0]),
			};

		if((operator.operand === "") && (needsExclusion)) {
			return [];
		}

		if(operator.operand !== "") {
			var baseTitle = operator.operand,
				baseTiddler = options.wiki.getTiddler(baseTitle),
				foundTitles = collectTitlesRecursively(baseTiddler,baseTitle,filterOptions);

			source(function(tiddler,title) {
				if(needsExclusion === (foundTitles.indexOf(title) === -1)) {
					results.push(title);
				}
			});
		} else {
			source(function(tiddler,title) {
				results = $tw.utils.pushTop(results,collectTitlesRecursively(tiddler,title,filterOptions));
			});
		}

		return results;
	}
})();
