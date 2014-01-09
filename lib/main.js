const widgets = require("sdk/widget");
const data = require("sdk/self").data;
const {Cc, Ci, Cu, Cr, Components} = require("chrome");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

var widget = widgets.Widget({
    id: "firefox-cors-override",
    label: "CORS",
    content: "CORS",
    onClick: function() {

    }
});

/**
 * Get the set of headers to set for a given URI
 * @param aURI {nsIURI} The URI to examine
 * @returns {object} Key-value dict of headers to set, or null if this URI
 *      has no overrides set
 */
function getHeadersForURI(aURI) {
    // TODO: add prefs
    if (!/\.local$/.test(aURI.host)) {
        return null;
    }
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,GET",
    };
}

function onObserve(subject, topic, data) {
    let channel = subject.QueryInterface(Ci.nsIHttpChannel)
                         .QueryInterface(Ci.nsITraceableChannel);
    let headers = getHeadersForURI(channel.URI);
    if (!headers) {
        // We don't care about this, drop it on the floor
        return;
    }
    if (channel.requestMethod == "OPTIONS") {
        // CORS prelight
        let newListener = {
            QueryInterface: XPCOMUtils.generateQI([Ci.nsIStreamListener,
                                                   Ci.nsIRequestObserver]),
            onStartRequest: function(aRequest, aContext) {
                // Fake a successful channel in onStartRequest so that the CORS
                // preflight passes.
                let fakeRequest = {
                    QueryInterface: XPCOMUtils.generateQI([Ci.nsIHttpChannel,
                                                           Ci.nsIChannel,
                                                           Ci.nsIRequest]),
                    status: Cr.NS_OK, // Always pretend to be successful
                    getRequestHeader: function(aHeader) {
                        if (aHeader == "Access-Control-Max-Age") {
                            // Force max-age to empty, so this never gets cached
                            return "";
                        }
                        return aRequest.getRequestHeader(aHeader);
                    }
                };
                return listener.onStartRequest(fakeRequest, aContext);
            }
        };
        let listener = channel.setNewListener(newListener);
        // We only care about onStartRequest; pass everythin else through
        newListener.onStopRequest = listener.onStopRequest.bind(listener);
        newListener.onDataAvailable = listener.onDataAvailable.bind(listener);
    } else {
        // Actual channel, set up the CORS headers
        for (let header in headers) {
            channel.setResponseHeader(header, headers[header], false);
        }
    }
    subject = channel = null; // Avoid reference cycle
}

Services.obs.addObserver(onObserve, "http-on-examine-response", false);
