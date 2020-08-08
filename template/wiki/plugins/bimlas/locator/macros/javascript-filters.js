/*\
title: $:/plugins/bimlas/locator/macros/javascript-filters.js
type: application/javascript
module-type: filteroperator

Special filters used by Locator

\*/
(function() {

	/*jslint node: true, browser: true */
	/*global $tw: true */
	"use strict";

	function getFieldDefinition(options,field) {
		var fieldOptionsTiddler = "$:/config/bimlas/locator/fields/" + field;

		return options.wiki.getCacheForTiddler(fieldOptionsTiddler,"fieldListingOperator",function() {
			var fieldOptions = options.wiki.getTiddler(fieldOptionsTiddler) || {fields: {}};
			var filterOperators = options.wiki.getFilterOperators();
			var fieldDefinitions = {
				"value": {
					fieldType: "value",
					direction: fieldOptions.fields["field-direction"],
					enlistChildren: {
						"to": function(title,input,prefix) {
							return filterOperators["field"](input,{operand: title,prefix: prefix,suffix: field},options);
						},
						"from": function(title,unusedInput,unusedPrefix) {
							return (options.wiki.getTiddler(title) || {fields: {}}).fields[field] || []
						}
					}
				},
				"list": {
					fieldType: "list",
					direction: fieldOptions.fields["field-direction"],
					enlistChildren: {
						"to": function(title,input,prefix) {
							return filterOperators["contains"](input,{operand: title,prefix: prefix,suffix: field},options);
						},
						"from": function(title,unusedInput,unusedPrefix) {
							return options.wiki.getTiddlerList(title,field) || [];
						}
					}
				}
			};
			var linksInTextDefinition = {
				fieldType: "value",
				direction: fieldOptions.fields["field-direction"],
				enlistChildren: {
					"to": function(title,unusedInput,unusedPrefix) {
						return options.wiki.getTiddlerBacklinks(title);
					},
					"from": function(title,unusedInput,unusedPrefix) {
						return options.wiki.getTiddlerLinks(title);
					}
				}
			};

			return field === "LINKS-IN-TEXT"
				? linksInTextDefinition
				: fieldDefinitions[fieldOptions.fields["field-type"] || "value"];
		});
	}

	function getActiveFilters(options,filterState) {
		return options.wiki.getCacheForTiddler(filterState,"activeFilters",function() {
			var filteredFields = options.wiki.getTiddlerDataCached(filterState,{});
			var results = {};

			$tw.utils.each(filteredFields,function(valuesAsString,field) {
				var values = $tw.utils.parseStringArray(valuesAsString) || [];
				if(values.length) {
					results[field] = values;
				}
			});

			return results;
		});
	}

	function applyFieldsFilters(source,options,filterState,filterFunc,prefix) {
		var activeFilters = getActiveFilters(options,filterState);
		var results = source;

		if(!Object.keys(activeFilters).length) return results;

		$tw.utils.each(activeFilters,function(values,field) {
			$tw.utils.each(values,function(value) {
				if(value === "ANY-VALUE") {
					var filterOperators = options.wiki.getFilterOperators();
					results = filterOperators["has"](results,{operand: field,prefix: prefix},options);
				} else {
					results = filterFunc(results,field,value,prefix);
				}
				results = options.wiki.makeTiddlerIterator(results);
			});
		});

		return results;
	}

	function getDirectionOfTraverse(options,contextState,fieldOfRelationship) {
		var direction = getFieldDefinition(options,fieldOfRelationship).direction;

		if(isDirectionInverted(options,contextState)) {
			direction = invertDirection(direction);
		}

		return direction;
	}

	function isDirectionInverted(options,contextState) {
		var contextStateTiddler = options.wiki.getTiddler(contextState) || {fields: []};
		return contextStateTiddler.fields["invert-direction"] === "yes"
	}

	function invertDirection(direction) {
		return ["from","to"][(direction === "from") + 0];
	}

	function enlistChildren(options,parentTitle,fieldOfRelationship,directionOfTraverse) {
		return options.wiki.getGlobalCache("bimlas-locator-enlist-children-" + parentTitle + "-" + fieldOfRelationship + "-" + directionOfTraverse, function() {
			var fieldDefinition = getFieldDefinition(options, fieldOfRelationship);
			var allTiddlers = options.wiki.makeTiddlerIterator(options.wiki.getTiddlers());
			return fieldDefinition.enlistChildren[directionOfTraverse](parentTitle,allTiddlers);
		});
	}

	/*
	Filter titles matching to Locator fields filter

	Input: list of tiddlers
	Param: filterState
	Prefix: "!" to exclude matching tiddlers
	Suffix: "recusive" enables recursive filtering
	*/
	exports["locator-fields-filter"] = function(source,operator,options) {
		var results = source;
		var activeRecursiveFilters = getActiveFilters(options,"$:/state/bimlas/locator/search/recursive-filters/");

		if(operator.suffix === "recursive") {
			results = applyFieldsFilters(results,options,operator.operand,recursiveFilterFunc,operator.prefix);
		} else {
			results = applyFieldsFilters(results,options,operator.operand,directFilterFunc,operator.prefix);
		}

		return results;

		function directFilterFunc(input,field,value,prefix) {
			var fieldDefinition = getFieldDefinition(options,field);
			return fieldDefinition.enlistChildren["to"](value,input,prefix);
		}

		function recursiveFilterFunc(input,field,fieldValue,prefix) {
			var isRecursiveFilteringActive = $tw.utils.hop(activeRecursiveFilters,field) && (activeRecursiveFilters[field].indexOf(fieldValue) >= 0);
			if(!isRecursiveFilteringActive) {
				return directFilterFunc(input,field,fieldValue,prefix);
			}

			var fieldDirection = getFieldDefinition(options,field).direction;
			var children = [];
			collectChildrenRecursively(fieldValue);
			var compareFunc = (prefix !== "!")
				? function(index) { return index >= 0 }
				: function(index) { return index < 0 };
			var results = [];

			input(function(tiddler,title) {
				if(compareFunc(children.indexOf(title))) {
					results = $tw.utils.pushTop(results, title);
				}
			});

			return results;

			function collectChildrenRecursively(parent) {
				$tw.utils.each(enlistChildren(options,parent,field,fieldDirection),function(child) {
					if(children.indexOf(child) < 0) {
						$tw.utils.pushTop(children, child);
						$tw.utils.pushTop(children, collectChildrenRecursively(child));
					}
				});
			}
		}
	};

	/*
	Filter fields that are not disabled in Locator field options

	Input: list of fields
	Param (optional): if called from toggleable fields filter (`locator-view` and `locator-search`), set to "nested"
	*/
	exports["locator-enabled-fields"] = function(source,operator,options) {
		var typeOfFieldsFilter = operator.operand || "regular";
		var excludedFields = options.wiki.filterTiddlers("[all[tiddlers+shadows]field:hide-in-" + typeOfFieldsFilter + "-fields-filter[yes]removeprefix[$:/config/bimlas/locator/fields/]]") || [];
		var results = [];

		source(function(tiddler,title) {
			if(excludedFields.indexOf(title) < 0) {
				results.push(title);
			}
		});

		return results;
	};

	/*
	List fields which can be used to build tree ("tags" for example)

	Input: none
	Param (optional): field to check if it's a relationship field
	*/
	exports["locator-enlist-relationship-fields"] = function(source,operator,options) {
		var relationshipFields = options.wiki.getGlobalCache("bimlas-locator-enlist-relationship-fields",function() {
			return options.wiki.filterTiddlers("[all[tiddlers+shadows]prefix[$:/config/bimlas/locator/fields/]has[field-direction]removeprefix[$:/config/bimlas/locator/fields/]]");
		});

		if(operator.operand) {
			return relationshipFields.indexOf(operator.operand) >= 0
				? [operator.operand]
				: [];
		}

		return relationshipFields;
	};

	/*
	List field values according to Locator field settings

	Input: list of tiddlers
	Param: field
	*/
	exports["locator-enlist-field-values"] = function(source,operator,options) {
		var fieldDefinition = getFieldDefinition(options,operator.operand);
		var results = [];

		source(function(tiddler,title) {
			if(!tiddler) return;

			var value = fieldDefinition.enlistChildren["from"](title);

			if(!value) return;

			results = $tw.utils.pushTop(results,value);
		});

		return results;
	};

	/*
	List of active field filters

	Input: filterState
	Param (optional): field
	*/
	exports["locator-selected-field-values"] = function(source,operator,options) {
		var activeFilters = {};

		source(function(tiddler,title) {
			$tw.utils.each(getActiveFilters(options,title),function(value,key) {
				activeFilters[key] = $tw.utils.pushTop(activeFilters[key] || [],value);
			});
		});

		if(!Object.keys(activeFilters).length) return [];

		return operator.operand
			? activeFilters[operator.operand] || []
			: ["TODO: Join active filter values (array of arrays)"];
	};

	/*
	List of active field names

	Input: filterState
	Param (optional): none
	*/
	exports["locator-selected-field-names"] = function(source,operator,options) {
		var fieldNames = [];

		source(function(tiddler,title) {
			fieldNames = $tw.utils.pushTop(fieldNames,Object.keys(getActiveFilters(options,title)));
		});

		return fieldNames;
	};

	/*
	List children of input elements based on selected relationship field

	Input: parent tiddlers
	Param (optional): contextState
	Suffix: field of relationship
	*/
	exports["locator-enlist-children"] = function(source,operator,options) {
		var fieldOfRelationship = operator.suffix;
		var directionOfTraverse = getDirectionOfTraverse(options,operator.operand,fieldOfRelationship);
		var results = [];

		source(function(tiddler,title) {
			results = $tw.utils.pushTop(results, enlistChildren(options,title,fieldOfRelationship,directionOfTraverse));
			results = options.wiki.sortByList(results,title);
		});

		return results;
	};

	/*
	Get direction of traverse: field direction + optional invert direction

	Input: contextState
	Param: field of relationship
	*/
	exports["locator-direction-of-traverse"] = function(source,operator,options) {
		var results = [];

		source(function(tiddler,title) {
			results = [getDirectionOfTraverse(options,title,operator.operand)];
		});

		return results;
	};

})();
