/*\
module-type: library

This handles all logging and alerts Relink emits.

\*/

exports.getString = function(title, options) {
	title = "$:/plugins/flibbles/relink/language/" + title;
	return options.wiki.renderTiddler("text/plain", title, options);
};

var logger;

exports.reportFailures = function(failureList, options) {
	if (!logger) {
		logger = new $tw.utils.Logger("Relinker");
	}
	var alertString = this.getString("Error/ReportFailedRelinks", options)
	var alreadyReported = Object.create(null);
	var reportList = [];
	$tw.utils.each(failureList, function(f) {
		if (!alreadyReported[f]) {
			if ($tw.browser) {
				// This might not make the link if the title is complicated.
				// Whatever.
				reportList.push("\n* [[" + f + "]]");
			} else {
				reportList.push("\n* " + f);
			}
			alreadyReported[f] = true;
		}
	});
	logger.alert(alertString + "\n" + reportList.join(""));
};
