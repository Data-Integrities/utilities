import path from 'path'; 
import fs from 'fs';
import { chromium } from 'playwright';
import { time } from 'console';

export class ExchangeRequest {

    // #region Static Methods
    // extracts cookies from Network.requestWillBeSentExtraInfo associatedCookies
    static extractCookiesFromRequestExtraInfo(associatedCookies, includeBlocked = false) {
        var cookies = [];
        for (var associatedCookie of associatedCookies) {
            var cookie = {};
            var srcCookie = associatedCookie;
            if (srcCookie.cookie) {
                srcCookie = associatedCookie.cookie;
            }
            cookie.name = srcCookie.name;
            cookie.value = srcCookie.value;
            var blocked = associatedCookie.blockedReasons && associatedCookie.blockedReasons.length > 0;
            if (blocked) {
                cookie.blocked = true;
                cookie.blockedReasons = associatedCookie.blockedReasons;
            }
            if (includeBlocked || !blocked) {
                cookies.push(cookie);
            }
        }
        return cookies;
    }

    // extracts cookies from Network.requestWillBeSent headers
    static extractCookiesFromRequestHeaders(headers) {
        var cookies = [];
        for (var prop in headers) {
            if (prop.toLowerCase() === 'cookie') {
                var cookieHeader = headers[prop];
                var cookiePairs = cookieHeader.split(';').map(c => c.trim()).filter(c => c.length > 0);
                for (var pair of cookiePairs) {
                    var [name, value] = pair.split('=');
                    cookies.push({ name, value });
                }
            }
        }
        return cookies;
    }  
    
    // merges request cookies
    static mergeRequestCookies(originalCookies, newCookies) {
        var merged = (originalCookies) ? [ ...originalCookies ] : [];
        if (!newCookies) return merged;
        for (const cookie of newCookies) {
            // Remove existing cookie with same name
            const index = merged.findIndex(c => c.name === cookie.name);
            if (index == -1) {
                merged.push(cookie);
            } else {
                merged[index] = cookie;
            }
        }

        // Sort by domain first, then name
        return merged.sort((a, b) => {
            if (a.domain !== b.domain) {
                return (a.domain || '').localeCompare(b.domain || '');
            }
            return (a.name || '').localeCompare(b.name || '');
        });
    }    

    // trimmed down version of request for redirect snapshot
    static filterRequestForRedirect(request) {
        if (!request) return null;

        const filtered = {
            requestCookies: request.requestCookies || [],
            method: request.method,
            headers: request.headers || {},
            url: request.url
        };

        if (request.hasPostData) {
            filtered.hasPostData = true;
            if (request.postData) {
                filtered.postData = request.postData;
                filtered.postDataParsed = request.postDataParsed;
            }
        }

        return filtered;
    }  
    // Finds cookies that are in newCookies but not in oldCookies (case-insensitive)
    // This detects which cookies were set by a redirect response
    static findNewCookies(oldCookies, newCookies) {
        if (!oldCookies || oldCookies.length === 0) {
            return newCookies || [];
        }
        if (!newCookies || newCookies.length === 0) {
            return [];
        }

        // Create a Set of old cookie names (lowercase for case-insensitive comparison)
        const oldCookieNames = new Set(
            oldCookies.map(c => (c.name || '').toLowerCase())
        );

        // Return cookies from newCookies whose names are NOT in oldCookies
        return newCookies.filter(c => {
            const cookieName = (c.name || '').toLowerCase();
            return !oldCookieNames.has(cookieName);
        });
    }
    // #endregion

    constructor(exchange, url) {
        this._exchange = exchange;
        this.url = url;
        this.method = null;
        this.headers = {};
        this._requestCookies = [];
        this.hasPostData = false;
        this._postData = null;
        this._postDataParsed = null;
        this.interceptionId = null;
        this._interceptedRequest = null;
    }

    // #region getters and setters
    get requestCookies() {
        return this._requestCookies;
    }

    set requestCookies(value) {
        this._requestCookies = value;
    }

    get exchange() {
        return this._exchange;
    }

    get exchanges() {
        return this.exchange.exchanges;
    }

    get postData() {
        return this._postData;
    }

    set postData(value) {
        this.hasPostData = true;
        this._postData = value;
        if (Exchange.stringLooksLikeJSON(value) && Exchange.isValidJSON(value)) {
            this._postDataParsed = JSON.parse(value);
        }
    }

    get postDataParsed() {
        return this._postDataParsed;
    }

    get client() {
        return this.exchange.client;
    }

    get exitUrlPattern() {
        return this.exchange.exchanges.exitUrlPattern;
    }

    get isExitPattern() {
        try {
            if (this.url) {
                return this.url.includes(this.exitUrlPattern);
            } else {
                return false;
            }
        } catch (e) {
            console.error('Error checking exit URL pattern:', e);
            return false;
        }
    }    

    // #endregion

    applyParams(params, eventType) {
        try {
            // Check if this request is the result of a redirect FIRST, before updating anything
            if (params.redirectResponse) {
                // Save the current request as the original request (if not already saved)
                if (!this.exchange._originalRequest) {
                    this.exchange._originalRequest = this.exchange.request;
                }

                // Create a NEW request object for the redirect target
                const newRequest = new ExchangeRequest(this.exchange, params.request?.url || this.url);

                // Apply params to the NEW request (without redirectResponse to prevent infinite recursion)
                const { redirectResponse, ...paramsWithoutRedirect } = params;
                newRequest.applyParams(paramsWithoutRedirect, eventType);

                // Create the redirect snapshot with the redirect response and the NEW request
                const redirectSnapshot = {
                    response: ExchangeResponse.filterResponseForRedirect(params.redirectResponse),
                    request: newRequest
                };

                this.exchange.redirects.push(redirectSnapshot);

                // Replace the exchange's current request with the new request
                // This allows subsequent events to update the new request
                this.exchange.request = newRequest;
                return;
            }

            // Not a redirect, apply params normally to this request
            if (params.request) {
                const req = params.request;

                if (req.url) {
                    this.url = req.url;
                }

                if (req.method) {
                    this.method = req.method;
                }
                if (req.headers) {
                    this.mergeHeaders(req.headers);
                }
                if (req.postData) {
                    this.postData = req.postData;
                }
                if (params.interceptionId) {
                    this.interceptionId = params.interceptionId;
                }

                var hasCookies = Exchange.requestHasCookies(req.headers);
                if (hasCookies) {
                    var cookies = ExchangeRequest.extractCookiesFromRequestHeaders(req.headers);
                    this.mergeCookies(cookies);
                }

                if (eventType === Exchange.EVENT_TYPES.RequestIntercepted) {
                    this._interceptedRequest = {
                        method: req.method,
                        headers: req.headers,
                        postData: req.postData || null,
                        hasPostData: req.hasPostData || false,
                        interceptionId: params.interceptionId || null,
                        frameId: params.frameId
                    };
                }
            }

            if (params.headers) {
                this.mergeHeaders(params.headers);
                // handle cookies in headers
                var hasCookies = Exchange.requestHasCookies(params.headers);
                if (hasCookies) {
                    var cookies = ExchangeRequest.extractCookiesFromRequestHeaders(params.headers);
                    this.mergeCookies(cookies);
                }
            }

            // handle cookies in associatedCookies
            if (params.associatedCookies && params.associatedCookies.length > 0) {
                var cookies = ExchangeRequest.extractCookiesFromRequestExtraInfo(params.associatedCookies, false);
                this.mergeCookies(cookies);
            }

            if (params.siteHasCookieInOtherPartition) {
                this.siteHasCookieInOtherPartition = params.siteHasCookieInOtherPartition;
            }
        } catch (e) {
            console.error('Error in applyParams:', e);
            throw e;
        }
    }

    mergeHeaders(newHeaders) {
        this.headers = Exchange.mergeHeaders(this.headers, newHeaders);
    }

    mergeCookies(newCookies) {
        this.requestCookies = ExchangeRequest.mergeRequestCookies(this.requestCookies, newCookies);
    }    

    async continueInterception() {
        await this.client.send('Network.continueInterceptedRequest', {
            interceptionId: this.interceptionId
        });
    }    

    toJSON() {
        const filterUnderscores = (obj) => {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(filterUnderscores);
            }

            const filtered = {};
            for (const [key, value] of Object.entries(obj)) {
                if (!key.startsWith('_')) {
                    filtered[key] = filterUnderscores(value);
                }
            }
            return filtered;
        };

        var result = filterUnderscores(this);

        if (this._requestCookies && this._requestCookies.length > 0) {
            result.requestCookies = this._requestCookies;
        }

        // Explicitly include getter values
        if (this.hasPostData) {
            result.postData = this.postData;
            if (this.postDataParsed) {
                result.postDataParsed = this.postDataParsed;
            }
        }

        return result;
    }

}

export class ExchangeResponse {
    // #region Static Methods
    // trimmed down version of response for redirect snapshot
    static filterResponseForRedirect(response) {
        if (!response) return null;

        const filtered = {
            status: response.status,
            statusText: response.statusText || '',
            headers: response.headers || {},
            mimeType: response.mimeType,
            protocol: response.protocol
        };

        // Extract cookies from Set-Cookie headers if present
        if (response.headers) {
            const cookies = ExchangeResponse.extractCookiesFromResponseHeaders(response.headers);
            if (cookies.length > 0) {
                filtered.responseCookies = cookies;
            }
        }

        // Also include responseCookies if they were already parsed
        if (response.responseCookies && response.responseCookies.length > 0) {
            // Merge with extracted cookies if both exist
            if (filtered.responseCookies) {
                filtered.responseCookies = [...filtered.responseCookies, ...response.responseCookies];
            } else {
                filtered.responseCookies = response.responseCookies;
            }
        }

        if (response.encodedDataLength !== undefined) {
            filtered.encodedDataLength = response.encodedDataLength;
        }
        if (response.contentLength !== undefined) {
            filtered.contentLength = response.contentLength;
        }

        return filtered;
    }  

    // merges response cookies, which may be wrapped in {cookie: {...}} objects
    static mergeResponseCookies(originalCookies, newCookies) {
        var merged = (originalCookies) ? [ ...originalCookies ] : [];
        if (!newCookies) return merged;

        for (const cookieWrapper of newCookies) {
            const cookie = (cookieWrapper.cookie) ? cookieWrapper.cookie : cookieWrapper;
            // Remove existing cookie with same name
            const index = merged.findIndex(c => c.name === cookie.name && c.domain === cookie.domain && c.path === cookie.path);
            if (index == -1) {
                merged.push(cookie);
            } else {
                merged[index] = cookie;
            }
        }

        // Sort by domain first, then name
        return merged.sort((a, b) => {
            if (a.domain !== b.domain) {
                return (a.domain || '').localeCompare(b.domain || '');
            }
            return (a.name || '').localeCompare(b.name || '');
        });
    }    

    // this runs through response headers and extracts Set-Cookie headers
    // it then splits the lines by the \n character and parses each cookie 
    static extractCookiesFromResponseHeaders(allHeaders) {
        var cookies = [];
        for (var prop in allHeaders) {
            if (prop.toLowerCase() === 'set-cookie') {
                var splitCookies = allHeaders[prop].split('\n').map(c => c.trim()).filter(c => c.length > 0);
                var parsedCookies = Exchange.parseStringArrayOfCookies(splitCookies);
                cookies = cookies.concat(parsedCookies);
            }
        }
        return cookies;
    }    
    // #endregion

    constructor(exchange) {
        this._exchange = exchange;
        this.status = null;
        this.statusText = null;
        this.mimeType = null;
        this.headers = {};
        this._protocol = null;
        this._responseCookies = [];
        this.encodedDataLength = 0;
        this.contentLength = 0;
        this._body = null;
        this._bodyParsed = null;
        this.hasContent = false;
        this._bodyByteSize = null;
        this._bodyLength = null;
    }

    // #region getters and setters

    get responseCookies() {
        return this._responseCookies;
    }

    set responseCookies(value) {
        this._responseCookies = value;
    }

    get exchange() {
        return this._exchange;
    }

    get requestId() {
        return this.exchange.requestId;
    }

    get exchanges() {
        return this.exchange.exchanges;
    }

    get requestMethod() {
        return this.exchange.request.method;
        //return this._requestMethod;
    }

    set requestMethod(value) {
        throw new Error('requestMethod is read-only');
        this._requestMethod = value;
    }

    get body() {
        return this._body;
    }

    set body(value) {
        this._body = value;
    }

    get client() {
        return this.exchange.client;
    }

    get completed() {
        return this.exchange.completed;
    }

    set completed(value) {
        this.exchange.completed = value;
    }    

    get shouldHaveBody() {
        const status = this.status;
        const method = this.requestMethod;
        const mimeType = this.mimeType;
        const hasContent = this.hasContent;
        var retval = (
                    // Status codes that never have bodies
                    status !== 204 && // No Content
                    status !== 304 && // Not Modified
                    status !== 205 && // Reset Content
                    // HEAD requests never have bodies
                    method !== 'HEAD' &&
                    // OPTIONS requests are preflight requests
                    method !== 'OPTIONS' &&
                    // Check content-length if available
                    hasContent &&
                    //contentLength !== undefined && contentLength !== '0' &&
                    // Check if it's a content type we can capture
                    mimeType &&
                    (mimeType.includes('json') ||
                    mimeType.includes('text') ||
                    mimeType.includes('xml'))
                );
        return retval;
    }

    get isPreflight() {
        return this.exchange.isPreflight;
    }

    get shouldLoadBody() {
        var retval = (this.hasContent && !this.isPreflight && this.exchange.request && !this.loadingFailed);
        return retval;
    }   
    // #endregion 

    applyParams(params, eventType) {

        if (params.response) {
            const res = params.response;
            if (res.status) {
                this.status = res.status;
            }
            if (res.statusText) {
                this.statusText = res.statusText;
            }
            if (res.mimeType) {
                this.mimeType = res.mimeType;
            }
            if (res.headers) {
                this.mergeHeaders(res.headers);
            }
            if (res.protocol) {
                this._protocol = res.protocol;
            }

            var cookies = ExchangeResponse.extractCookiesFromResponseHeaders(params.response.headers);
            if (cookies && cookies.length > 0) {
                this.mergeCookies(cookies);
            }

            if (Exchange.headersHasHeaderName(res.headers, 'Set-Cookie')) {
                this.mergeCookies(Exchange.headerValueIgnoreCase(res.headers, 'Set-Cookie'));
            }         

            this.encodedDataLength = res.encodedDataLength || 0;  
            if (Exchange.headersHasHeaderName(res.headers, 'Content-Length')) {
                this.contentLength = parseInt(Exchange.headerValueIgnoreCase(res.headers, 'Content-Length'), 10);
            }
            this.hasContent = this.encodedDataLength > 0 || this.contentLength > 0;
        }
                    // Check if this request is the result of a redirect
        if (params.redirectResponse) {
            // Snapshot current request with the filtered redirect response
            const redirectSnapshot = {
                response: ExchangeResponse.filterResponseForRedirect(params.redirectResponse),
                request: ExchangeRequest.filterRequestForRedirect(this.request)
            };
            this.exchanges.redirects.push(redirectSnapshot);
        }

        if (params.statusCode) {
            this.status = params.statusCode;
        }

        if (params.headers) {
            this.mergeHeaders(params.headers);
            var cookies = ExchangeResponse.extractCookiesFromResponseHeaders(params.headers);
            if (cookies && cookies.length > 0) {
                this.mergeCookies(cookies);
            }            
        }

        if (eventType == Exchange.EVENT_TYPES.ResponseReceivedExtraInfo) {
            // nothing additional for now  
            if (this.shouldHaveBody) {
                this.completed = false;
            } else {
                // No body expected, mark as completed
                this.completed = true;
            }             
        }

        // if (eventType == Exchange.EVENT_TYPES.ResponseReceivedExtraInfo) {
        //     this.completed = true;
        // }

        if (eventType == Exchange.EVENT_TYPES.LoadingFinished) {
            this._loadingFinished = {
                timestamp: params.timestamp,
                encodedDataLength: params.encodedDataLength
            };

            if (params.encodedDataLength > 0) {
                this.encodedDataLength = params.encodedDataLength;
                if (!this.hasContent) {
                    this.hasContent = true;
                }
            }
            this.completed = true;            
        }

        if (eventType == Exchange.EVENT_TYPES.LoadingFailed) {
            this.loadingFailed = {
                timestamp: params.timestamp,
                errorText: params.errorText,
                canceled: params.canceled || false
            };
            this.completed = true;
        }
    }

    async loadBody() {
        try {
            const requestId = this.requestId;
            const body = await this.client.send('Network.getResponseBody', { requestId });
            var byteSize = body.body.length;
            this.body = body.base64Encoded
                ? Buffer.from(body.body, 'base64').toString()
                : body.body;
            var bodyLength = this.body.length;
            this._bodyByteSize = byteSize;
            this._bodyLength = bodyLength;

            // Parse JSON if possible
            if (this.mimeType && this.mimeType.includes('json')) {
                try {
                    this._bodyParsed = JSON.parse(this.body);
                } catch (e) {
                    // Keep as string if not valid JSON
                }
            }
        } catch (e) {
            //console.error('Error loading body:', e.message);
            throw e;
        }
    }

    mergeCookies(newCookies) {
        this.responseCookies = ExchangeResponse.mergeResponseCookies(this.responseCookies, newCookies);
    }

    mergeHeaders(newHeaders) {
        this.headers = Exchange.mergeHeaders(this.headers, newHeaders);
    }

    toJSON() {
        const filterUnderscores = (obj) => {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(filterUnderscores);
            }

            const filtered = {};
            for (const [key, value] of Object.entries(obj)) {
                if (!key.startsWith('_')) {
                    filtered[key] = filterUnderscores(value);
                }
            }
            return filtered;
        };

        var filtered = filterUnderscores(this);
        if (this.responseCookies && this.responseCookies.length > 0) {
            filtered.responseCookies = this.responseCookies;
        }
        if (this._body !== null) {
            filtered.body = this.body;
        }   
        if (this._bodyParsed !== null) {
            filtered.bodyParsed = this._bodyParsed;
        }
        if (this._bodyFile !== null) {
            filtered.bodyFile = this._bodyFile;
        }
        if (this._loadingFinished !== null) {
            filtered.loadingFinished = this._loadingFinished;
        }
        return filtered;
    }

}

export class FiredEvent {
    constructor(exchange, eventType, params) {
        this._requestId = params.requestId || exchange.requestId;
        this._requestMethod = Exchange.requestMethodFromParams(params) || exchange.requestMethod;
        this._timestamp = Date.now();
        this._eventType = eventType;
        this._exchange = exchange;
        this._isExitPattern = exchange.request.isExitPattern;
        if (params && params.frameId) {
            this._frameId = params.frameId;
        }
        // add to events fired for exchange
        exchange._eventsFired[eventType] = this;
    }

    get idString() {
        var ids = [];

        if (this._requestId) {
            ids.push({req: this._requestId});
        }
        if (this._frameId) {
            ids.push({frame: this._frameId});
        }

        var idstr = ids.map(id => {
            return Object.entries(id).map(([key, value]) => `${key}:${value}`).join(' ');
        }).join(',');
        return idstr;
    }

    // return timestamp in mm/dd/yyyy hh:mm:ss.sss format
    get firedAt() {
        const date = new Date(this._timestamp);
        return date.toLocaleString('en-US', { timeZone: 'CST', hour12: false });
    }

    get symbolIcon() {
        var symbol = '⬇️';  // Default GET
        if (this._isExitPattern) {
            symbol = '🛑';
        } else if (this.requestMethod === 'OPTIONS') {
            symbol = '🔍';
        } else if (this.requestMethod === 'POST') {
            symbol = '📤';
        } else if (this.requestMethod === 'PUT' || this.requestMethod === 'PATCH') {
            symbol = '🔄';
        } else if (this.requestMethod === 'DELETE') {
            symbol = '🗑️';
        }
        return symbol;
    }

    toJSON() {
        var ids = this._requestId || '';
        if (this._frameId) {
            ids += `:${this._frameId}`;
        }

        var retval = {
            id: ids,
            datetime: this.firedAt,
        };
        
        return retval;
    }
}

export class Exchange {

    // #region Static Methods and Properties
    static IGNORE_ENDPOINTS = [
        'my.bswhealth.com/scripts',
        'my.bswhealth.com/release/js',
        'my.bswhealth.com/tm/appUpdate',
        'sso.bswhealth.com/Andylitics',
        'mychart.bswhealth.com/DT/scripts',
        'mychart.bswhealth.com/DT/bundles',
        'andylitics.bswapi.com',
        'andylitics-dev.bswhive.com',
        'omnichannelengagementhub',
        'amplitude.com',
        'dc.services.visualstudio.com',
        'google-analytics.com',
        'googletagmanager.com',
        'qualtrics.com',
        'doubleclick.net',
        'facebook.com',
        'twitter.com',
        'fonts.googleapis.com',
        'fonts.gstatic.com',
        'DT/PerformanceMetrics',
        'mychart.bswhealth.com/DT/en-US/styles/bundles',
        'DT/Analytics',
        'bswcdndesign-prod.bswhealth.com',
        'DT/templates',
        'gtm.bswhealth.com',
        '/lotties/',
        '.min.js',
        '.css',
        '.woff',
        '.woff2',
        '.ttf',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.ico'
    ];   


    static EVENT_TYPES = {
        RequestIntercepted: "RequestIntercepted",
        RequestWillBeSent: "RequestWillBeSent",
        RequestWillBeSentExtraInfo: "RequestWillBeSentExtraInfo",
        ResponseReceived: "ResponseReceived",
        ResponseReceivedExtraInfo: "ResponseReceivedExtraInfo",
        ResponseWillBeSentExtraInfo: "ResponseWillBeSentExtraInfo",
        LoadingFinished: "LoadingFinished",
        LoadingFailed: "LoadingFailed"
    };    
    
    // checks if URL should be ignored based on static list
    static shouldIgnoreUrl(url) {
        try {
            return Exchange.IGNORE_ENDPOINTS.some(endpoint => {
                if (url.includes(endpoint)) {
                    //console.log(` (${url}).includes('${endpoint}') → true - ignored`);
                    return true;
                }

                return false;
            });
        } catch (e) {
            console.error('Error checking ignored URLs:', e);
            return false;
        }
    }

    // merges headers, with newHeaders taking precedence
    // Normalizes all header keys to lowercase (HTTP headers are case-insensitive)
    static mergeHeaders(originalHeaders, newHeaders) {
        if (!originalHeaders) {
            // Normalize new headers to lowercase
            const normalized = {};
            for (const key in newHeaders) {
                normalized[key.toLowerCase()] = newHeaders[key];
            }
            return normalized;
        }

        const merged = {};

        // Add original headers (lowercased keys)
        for (const key in originalHeaders) {
            merged[key.toLowerCase()] = originalHeaders[key];
        }

        // Merge new headers (lowercased keys, overwrite if exists)
        for (const key in newHeaders) {
            merged[key.toLowerCase()] = newHeaders[key];
        }

        // Sort by lowercase key
        return Object.keys(merged)
            .sort((a, b) => a.localeCompare(b))
            .reduce((sorted, key) => {
                sorted[key] = merged[key];
                return sorted;
            }, {});
    }

    // parses an array of Set-Cookie strings into an array of cookie objects
    static parseStringArrayOfCookies(setCookieHeaders) {
        const cookies = [];
        for (const cookieStr of setCookieHeaders) {
            const cookie = Exchange.parseCookie(cookieStr);
            if (cookie) {
                cookies.push(cookie);
            }
        }
        return cookies;
    }

    // parses a single Set-Cookie string into an object
    static parseCookie(cookieStr) {
        const cookie = {};
        const parts = cookieStr.split(';').map(part => part.trim());
        const [nameValue, ...attributes] = parts;
        const [name, value] = nameValue.split('=');
        cookie.name = name;
        cookie.value = value;

        attributes.forEach(attr => {
            const [attrName, attrValue] = attr.split('=');
            const attrLower = attrName.toLowerCase();

            // Handle boolean flags vs value attributes
            if (attrLower === 'httponly' || attrLower === 'secure') {
                cookie[attrLower] = true;
            } else if (attrValue !== undefined) {
                cookie[attrLower] = attrValue;
            } else {
                cookie[attrLower] = true;
            }
        });

        return cookie;
    }

    // case-insensitive check for Cookie header in request
    static requestHasCookies(headers) {
        return Exchange.headersHasHeaderName(headers, 'cookie');
    }

    // case-insensitive header existence check
    static headersHasHeaderName(headers, headerName) {
        for (var prop in headers) {
            if (prop.toLowerCase() === headerName.toLowerCase()) {
                return true;
            }
        }
        return false;
    }

    // case-insensitive header value retrieval
    static headerValueIgnoreCase(headers, headerName) {
        for (var prop in headers) {
            if (prop.toLowerCase() === headerName.toLowerCase()) {
                return headers[prop];
            }
        }
        return null;
    }

    // checks if cookie is a MyChart persistence cookie
    static cookieIsMychartPersist(cookie) {
        return cookie.name === 'MCPersist' || cookie.name === 'MyChartPersistence';
    }

    // tries to get request method from various places in params
    static requestMethodFromParams(params) {
        let retval = null;
        if (params.request && params.request.method) {
            retval = params.request.method;
        } else
        if (params.headers && Exchange.headersHasHeaderName(params.headers, ':method')) {
            retval = Exchange.headerValueIgnoreCase(params.headers, ':method');
        }
        return retval;
    }    

    // tries to get URL from various places in params
    static urlFromParams(params) {
        let url = null;
        if (params.request && params.request.url) {
            url = params.request.url;
        } else 
        if (params.response && params.response.url) {
            url = params.response.url;
        } else 
        if (params.interceptedRequest && params.interceptedRequest.url) {
            url = params.interceptedRequest.url;
        } else 
        if (params.documentURL) {
            url = params.documentURL;
        } else 
        if (params.headers && Exchange.headersHasHeaderName(params.headers, ':path')) {
            var scheme = Exchange.headerValueIgnoreCase(params.headers, ':scheme') || 'http';
            var host = Exchange.headerValueIgnoreCase(params.headers, ':authority') || Exchange.headerValueIgnoreCase(params.headers, 'host') || 'localhost';
            var path = Exchange.headerValueIgnoreCase(params.headers, ':path') || '/';
            url = `${scheme}://${host}${path}`;
        }

        return url;
    }   
    
    // simple check to see if a string looks like JSON
    static stringLooksLikeJSON(str) {
        if (typeof str !== 'string') {
            return false;
        }
        str = str.trim();
        if (str.length === 0) {
            return false;
        }
        if (str[0] === '{' && str[str.length - 1] === '}') {
            return true;
        }
        if (str[0] === '[' && str[str.length - 1] === ']') {
            return true;
        }
        return false;
    }

    // checks valid JSON by trying to parse it
    static isValidJSON(str) {
        try {
            JSON.parse(str);
            return true;
        } catch (e) {
            return false;
        }
    }

    // #endregion  

    constructor(exchanges, params, url, eventType) {
        // these have to be first
        this._exchanges = exchanges;
        this.url = url;
        this.finalUrl = null;        

        this._requestId = null;
        this._frameId = null; 
        this._requestMethod = null;
        this.loaderId = null;
        this.type = null;
        this.wallTime = null;
        this.timestamp = null;
        this.isNavigationRequest = false;
        this.redirectHasExtraInfo = false;

        // request, response, redirects, and events fired must be created
        // before calling this.applyRequestParams()
        this.request = new ExchangeRequest(this, url);
        this._originalRequest = null; // Will be set to the first request when a redirect occurs
        this.response = new ExchangeResponse(this);
        this.redirects = [];
        this._eventsFired = {};

        this.applyRequestParams(params, eventType);

        this.targetResponseReceived = false;
    }

    // #region getters and setters
    get eventNamesFired() {
        return Object.keys(this._eventsFired);
    }

    get exchanges() {
        return this._exchanges;
    }

    get shouldCapture() {
        var retval = true;

        // skip capture if no URL
        if (!this.url) {    
            retval = false;
        }

        // skip capture if in the IGNORE list
        if (Exchange.shouldIgnoreUrl(this.url)) {
            retval = false;
        }

        // capture if exit pattern
        if (this.exchanges.urlIsExitPattern(this.url)) {
            retval = true;
        }

        // don't need OPTIONS/preflight requests
        if (this.request && this.request.method === 'OPTIONS') {
            retval = false;
        }

        // don't need HEAD requests
        if (this.request && this.request.method === 'HEAD') {
            retval = false;
        }

        // don't capture if request cookies but no res
        // if (this.request && this.request.requestCookies && this.request.requestCookies.length > 0) {
        //     retval = true;
        // }

        // we always capture if response cookies
        if (this.hasResponseCookies) {
            retval = true;
        }
        return retval;
    }

    get shouldIgnore() {
        var retval = false;
        if (!this.url) {
            retval = true;
        }
        if (Exchange.shouldIgnoreUrl(this.url)) {
            retval = true;
        }
        if (this.exchanges.urlIsExitPattern(this.url)) {
            retval = false;
        }
        // if (this.request && this.request.requestCookies && this.request.requestCookies.length > 0) {
        //     retval = false;
        // }
        if (this.response && this.response.responseCookies && this.response.responseCookies.length > 0) {
            retval = false;
        }
        return retval;
    }    

    get requestId() {
        return this._requestId;
    }

    set requestId(value) {
        if (value != this._requestId) {
            if (this._requestId && this.exchanges) {
                this.exchanges.exchanges.delete(this._requestId);
            }
            this._requestId = value;
            if (this.exchanges) {
                this.exchanges.exchanges.set(value, this);
            }
        }
    }

    get frameId() {
        return this._frameId;
    }

    set frameId(value) {
        if (value != this._frameId) {
            if (this._frameId && this.exchanges) {
                this.exchanges.exchangesByFrameId.delete(this._frameId);
            }
            this._frameId = value;
            if (this.exchanges) {
                this.exchanges.exchangesByFrameId.set(value, this);
            }
        }
    }

    get requestMethod() {
        return this._requestMethod;
    }

    set requestMethod(value) {
        try {
            if (this._requestMethod == null) {
                this._requestMethod = value;
                this.request.method = value;
            } else 
            if (this._requestMethod == 'OPTIONS' && value != 'OPTIONS') {
                this._requestMethod = value;
                this.request.method = value;
            } else{
                if (value != "OPTIONS") {
                    if (value != this._requestMethod) {
                        throw new Error(`Mismatched request methods: intercepted ${this._requestMethod} vs willBeSent ${value}`);
                    }
                    this._requestMethod = value;
                    this.request.method = value;                
                }
            }    
        } catch (e) {
            console.log(`Error setting request method for ${this.url}: ${e.message}`);
            this._requestMethod = null;
            this.request.method = null;
        }   
    }

    get isPreflight() {
        return this._requestMethod === 'OPTIONS';
    }

    get hasRequestCookies() {
        var hasC = this.request && this.request.requestCookies && this.request.requestCookies.length > 0;
        if (hasC) {
            //console.log(`Exchange for ${this.url} has request cookies: `, this.request.requestCookies);
        }
        return hasC;
    }    

    get hasResponseCookies() {
        var hasC = this.response && this.response.responseCookies && this.response.responseCookies.length > 0;
        // has cookies is true only if there are cookies other than MyChart persistence cookies
        if (hasC) {
            this.response.responseCookies.forEach(cookie => {
                hasC = false;
                var mcpersist = Exchange.cookieIsMychartPersist(cookie);    
                if (!mcpersist) {
                    hasC = true;
                }
            });
        }
        return hasC;
    }

    get hasRedirects() {
        return this.redirects && this.redirects.length > 0;
    }

    get redirectsHaveCookies() {
        var retval = false;
        for (var redirect of this.redirects) {
            if (redirect.response && redirect.response.responseCookies && redirect.response.responseCookies.length > 0) {
                retval = true;
                break;
            }
        }
        return retval;
    }

    get hasCookies() {
        var retval = false;
        if (!retval &&this.hasRequestCookies) {
            retval = true;
        }
        if (!retval && this.hasResponseCookies) {
            retval = true;
        }
        if (!retval && this.hasRedirects && this.redirectsHaveCookies) {
            retval = true;
        }
        return retval;
    }

    get hasBody() {
        var hasB = false;
        if (this.response && this.response.body && this.response.body.length > 0) {
            hasB = true;
        }
        return hasB;
    }

    get bodyFileName() {
        try {
            const urlObj = new URL(this.url);

            // Get the last segment of the path (the actual filename)
            let filename = urlObj.pathname.split('/').pop();

            // Special handling for inside.asp with mode parameter
            if (filename === 'inside.asp' && urlObj.searchParams.has('mode')) {
                const modeParam = urlObj.searchParams.get('mode');
                filename = `inside-asp-mode-${modeParam}.html`;
                return filename;
            }

            // If no filename (root path like https://my.bswhealth.com/), use domain
            if (!filename || filename === '') {
                filename = urlObj.hostname.replace(/\./g, '-');
            }

            // Strip compression extensions - body is already decompressed
            if (filename.endsWith('.gz')) {
                filename = filename.slice(0, -3);
            } else if (filename.endsWith('.br')) {
                filename = filename.slice(0, -3);
            }

            // Remove any remaining invalid characters
            filename = filename.replace(/[^a-zA-Z0-9._-]/g, '-');

            // If there's no extension, add one based on MIME type
            if (!filename.includes('.')) {
                const mimeToExt = {
                    'application/json': '.json',
                    'text/html': '.html',
                    'text/plain': '.txt',
                    'application/javascript': '.js',
                    'text/javascript': '.js',
                    'application/xml': '.xml',
                    'text/xml': '.xml',
                    'text/css': '.css'
                };
                const ext = mimeToExt[this.response.mimeType] || '.txt';
                filename += ext;
            }

            return filename;

        } catch (e) {
            // Fallback if URL parsing fails
            return `body-${this.requestId.replace(/[^a-zA-Z0-9]/g, '-')}.txt`;
        }
    }

    get isExitPattern() {
        return this.request.isExitPattern;
    }

    get client() {
        return this.exchanges.client;
    }

    // #endregion


    applyRequestParams(params, eventType) {
        try {
            if (params.requestId) {
                this.requestId = params.requestId;
            }
            if (params.frameId) {
                this.frameId = params.frameId;
            }
            if (params.loaderId) {
                this.loaderId = params.loaderId;
            }

            if (params.isNavigationRequest) {
                this.isNavigationRequest = params.isNavigationRequest;
            }

            if (params.resourceType) {
                this.resourceType = params.resourceType;
            }

            if (params.request && params.request.method) {
                this.requestMethod = params.request.method;
            }

            if (params.type) {
                this.type = params.type;
            }

            if (params.wallTime) {
                this.wallTime = params.wallTime;
            }

            if (params.timestamp) {
                this.timestamp = params.timestamp;
            }

            if (params.redirectHasExtraInfo) {
                this.redirectHasExtraInfo = params.redirectHasExtraInfo;
            }

            // Set finalUrl if we've had any redirects
            if (this.redirects.length > 0 && params.request && params.request.url) {
                this.finalUrl = params.request.url;
            }      
        } catch (e) {
            console.log(`Error applying request params for ${this.url}: ${e.message}`);
            throw e;
        }  

    }

    applyResponseParams(params, eventType) {
        // Currently no response params to apply
    }

    // #region CDP Event Handlers for data capture
    // ----------------------------------------------------------------------
    // CDP Event Handlers for data capture
    // ----------------------------------------------------------------------
    async requestIntercepted(params, eventType) {
        try {          
            this.log(eventType, params);
            this.applyRequestParams(params, eventType);
            this.request.applyParams(params, eventType);
            
            // Continue the request
            await this.request.continueInterception();

            if (this.isExitPattern) {
                this.exitCapture();
            }            
        } catch (e) {
            this.logError(eventType, params, `Error continuing intercepted request: ${e.message}`);
        }            
    }

    async requestWillBeSent(params, eventType) {
        try {
            this.log(eventType, params);

            // Check if this request is the result of a redirect
            // if (params.redirectResponse) {
            //     // Snapshot current request with the filtered redirect response
            //     const redirectSnapshot = {
            //         response: ExchangeResponse.filterResponseForRedirect(params.redirectResponse),
            //         request: ExchangeRequest.filterRequestForRedirect(this.request)
            //     };
            //     this.redirects.push(redirectSnapshot);
            // }

            this.applyRequestParams(params, eventType);
            this.request.applyParams(params, eventType);
            

            if (this.isExitPattern) {
                this.exitCapture();
            }
        } catch (e) {
            this.logError(eventType, params, `Error processing requestWillBeSent: ${e.message}`);
        }            
    }

    async requestWillBeSentExtraInfo(params, eventType) {
        try {        
            this.log(eventType, params);

            this.applyRequestParams(params, eventType);
            this.request.applyParams(params, eventType);
        } catch (e) {
            this.logError(eventType, params, `Error processing requestWillBeSentExtraInfo: ${e.message}`);
        }
    }

    async responseReceived(params, eventType) {
        try {
            this.log(eventType, params);

            this.applyResponseParams(params, eventType);
            this.response.applyParams(params, eventType);
        
            if (this.isExitPattern) {
                this.targetResponseReceived = true;
                this.exitCapture();
            }
        } catch (e) {
            this.logError(eventType, params, `Error processing responseReceived: ${e.message}`);
        }
    }

    async responseReceivedExtraInfo(params, eventType) {
        try {        
            this.log(eventType, params);

            this.applyResponseParams(params, eventType);
            this.response.applyParams(params, eventType);
        } catch (e) {        
            this.logError(eventType, params, `Error processing responseReceivedExtraInfo: ${e.message}`);
        }
    }
   
    async loadingFinished(params, eventType) {  
        try {              
            this.log(eventType, params);

            this.response.applyParams(params, eventType);
            this.applyResponseParams(params, eventType);
            if (this.response.shouldLoadBody) {
                await this.response.loadBody();
            }

  

            // if (this.response.hasContent && !this.isPreflight && this.request && !this.response.loadingFailed) {
            //     const body = await this.client.send('Network.getResponseBody', { requestId });
            //     var byteSize = body.body.length;
            //     this.response.body = body.base64Encoded
            //         ? Buffer.from(body.body, 'base64').toString()
            //         : body.body;
            //     var bodyLength = this.response.body.length;
            //     this.response.byteSize = byteSize;
            //     this.response.bodyLength = bodyLength;

            //     // Parse JSON if possible
            //     if (this.response.mimeType.includes('json')) {
            //         try {
            //             this.response.bodyParsed = JSON.parse(this.response.body);
            //         } catch (e) {
            //             // Keep as string if not valid JSON
            //         }
            //     }
            // }
        } catch (e) {
            this.logError(eventType, params, `Error processing loadingFinished: ${e.message}`);
        }
    }

    async loadingFailed(params, eventType) {
        try {        
            this.log(eventType, params, params.errorText);
            this.applyResponseParams(params, eventType);
            this.response.applyParams(params, eventType);
        } catch (e) {
            this.logError(eventType, params, `Error processing loadingFailed: ${e.message}`);
        }
    }
    // #endregion

    // #region Logging Methods
    log(eventType, params, message) {
        try {
            var firedEvent = new FiredEvent(this, eventType, params);
            if (this.exchanges.exitingCapture) {
                return;
            }        
            var doLog = false;
            switch (eventType) {
                case Exchange.EVENT_TYPES.RequestIntercepted:
                    doLog = this.exchanges.options.logRequestIntercepted;
                    break;
                case Exchange.EVENT_TYPES.RequestWillBeSent:
                    doLog = this.exchanges.options.logRequestWillBeSent;
                    break;
                case Exchange.EVENT_TYPES.RequestWillBeSentExtraInfo:
                    doLog = this.exchanges.options.logRequestWillBeSentExtraInfo;
                    break;
                case Exchange.EVENT_TYPES.ResponseReceived:
                    doLog = this.exchanges.options.logResponseReceived;
                    break;
                case Exchange.EVENT_TYPES.ResponseReceivedExtraInfo:
                    doLog = this.exchanges.options.logResponseReceivedExtraInfo;
                    break;
                case Exchange.EVENT_TYPES.ResponseWillBeSentExtraInfo:
                    doLog = this.exchanges.options.logResponseWillBeSentExtraInfo;
                    break;
                case Exchange.EVENT_TYPES.LoadingFinished:
                    doLog = this.exchanges.options.logLoadingFinished;
                    break;
                case Exchange.EVENT_TYPES.LoadingFailed:
                    doLog = this.exchanges.options.logLoadingFailed;
                    break;
                default:
                    doLog = false;
                    break;
            }

            const idstr = firedEvent.idString;
            // Select symbol based on request method and exit pattern
            const symbol = firedEvent.symbolIcon;


            var logMessage = `${symbol} ${idstr} ${eventType}  ${this.url}`;
            if (message) {
                logMessage += ` - ${message}`;
            }

            if (doLog) {
                console.log(logMessage);
            }
        } catch (e) {
            console.log(`Error logging event ${eventType} for ${this.url}: ${e.message}`);
            throw e;
        }
    }

    logError(eventType, params, message) {
        var firedEvent = new FiredEvent(this, eventType, params);
        if (this.exchanges.exitingCapture) {
            return;
        }

        const idstr = firedEvent.idString;

        var logMessage = `❌ ${idstr} ${eventType}  ${this.url}`;
        if (message) {
            logMessage += ` - ${message}`;
        }

        console.log(logMessage);
        
    }  
    // #endregion      
    
    // #region Serialization
    toJSON() {
        const filterUnderscores = (obj) => {
            if (obj === null || typeof obj !== 'object') {
                return obj;
            }

            if (Array.isArray(obj)) {
                return obj.map(filterUnderscores);
            }

            const filtered = {};
            for (const [key, value] of Object.entries(obj)) {
                if (!key.startsWith('_')) {
                    filtered[key] = filterUnderscores(value);
                }
            }
            return filtered;
        };

        var result = filterUnderscores(this);
        if (this.requestId) {
            result.requestId = this.requestId;
        }
        if (this.frameId) {
            result.frameId = this.frameId;
        }
        result.eventsFired = this.eventNamesFired;

        // Use the original request if it exists (preserves the original request URL)
        if (this._originalRequest) {
            result.request = this._originalRequest;
        }

        return result;
    }

    exitCapture() {        
        
        var networkExchanges = this.exchanges;
        this.exchanges.exitingCapture = true;
        if (this.targetResponseReceived) {         
            console.log('\n✅ TARGET RESPONSE RECEIVED! Saving and exiting...');
            setTimeout(async () => {
                    await networkExchanges.saveCaptures();
                    await networkExchanges.browser.close();
                    process.exit(0);
            }, 1000);            
        } else {
            console.log('\n✅ TIMEOUT: Saving capture after 10 seconds...');
            setTimeout(async () => {                  
                    await networkExchanges.saveCaptures();
                    await networkExchanges.browser.close();
                    process.exit(0);
            }, 10000);            
        }
    }

    computeRedirectCookies() {
        if (!this.hasRedirects) {
            return;
        }

        // Walk through each redirect and compute which cookies it set
        this.redirects.forEach((redirect, index) => {
            // Get the cookies from the PREVIOUS request
            let previousCookies;
            if (index === 0) {
                // First redirect - compare with original request
                previousCookies = this._originalRequest?.requestCookies || [];
            } else {
                // Subsequent redirects - compare with previous redirect's request
                previousCookies = this.redirects[index - 1].request?.requestCookies || [];
            }

            // Get the cookies from the CURRENT redirect's request (the new request created by the redirect)
            const currentCookies = redirect.request?.requestCookies || [];

            // Find new cookies (cookies in current that weren't in previous)
            const newCookies = ExchangeRequest.findNewCookies(previousCookies, currentCookies);

            // Add the new cookies to the redirect response (if any were found)
            if (newCookies.length > 0) {
                if (!redirect.response) {
                    redirect.response = {};
                }
                redirect.response.responseCookies = newCookies;
            }
        });
    }

    setRedirectsSequence(origRequestSequence) {
        if (this.hasRedirects) {
            // First compute which cookies each redirect set
            this.computeRedirectCookies();

            // Then set the sequence numbers
            this.redirects.forEach((redirect, index) => {
                redirect.sequence = origRequestSequence + '.' + (index + 1).toString();
            });
        }
    }
    // #endregion
}

export class Exchanges {
    constructor(exitUrlPattern, options = {}) {
        this.exitingCapture = false;
        this.savedCaptures = false;
        this.save_all_captures = true;
        this.client = null;
        this.browser = null;
        this.page = null;
        this.context = null;

        this.exitUrlPattern = exitUrlPattern;
        this.exchanges = new Map();
        //this.pendingBodyFetches = new Map();
        this.exchangesByFrameId = new Map();

        // Clean up bodies folder at startup
        const bodiesDir = './captures/bodies';
        try {
            if (fs.existsSync(bodiesDir)) {
                const files = fs.readdirSync(bodiesDir);
                files.forEach(file => {
                    fs.unlinkSync(path.join(bodiesDir, file));
                });
                console.log(`🧹 Cleaned ${files.length} files from ${bodiesDir}`);
            }
        } catch (e) {
            console.log(`⚠️  Could not clean bodies folder: ${e.message}`);
        }
        if (!options || options == {}) {
            options = {
                logIdTypeCheck: true,
                logRequestIntercepted: true,
                logRequestWillBeSent: true,
                logRequestWillBeSentExtraInfo: true,
                logResponseReceived: true,
                logResponseReceivedExtraInfo: true,
                logLoadingFinished: true,
                logLoadingFailed: true
            };
        }
        this.options = options;
    }

    // #region Browser Initialization
    // Initialize Playwright browser and context
    async init() {
        this.browser = await chromium.launch({
            headless: false,
            devtools: true
        });

        this.context = await this.browser.newContext({
            viewport: null  // Disables fixed viewport, allows manual resizing
        });
        this.page = await this.context.newPage();

        // Remove ALL timeouts
        this.page.setDefaultTimeout(0);
        this.page.setDefaultNavigationTimeout(0);

        // Use CDP (Chrome DevTools Protocol) for most reliable capture
        this.client = await this.page.context().newCDPSession(this.page);

        // Enable all necessary domains for complete data capture
        // Enable with maxPostDataSize to capture full POST bodies
        await this.client.send('Network.enable', {
            maxPostDataSize: 65536 // 64KB max POST data
        });
        await this.client.send('Network.setCacheDisabled', { cacheDisabled: true });

        // Enable request interception to capture POST data more reliably
        await this.client.send('Network.setRequestInterception', {
            patterns: [{ urlPattern: '*' }]
        });
    }

    // navigate to Baylor MyChart and pre-fill login
    async navigateToMyBSWHealth() {
        console.log('\n📱 Opening Baylor MyChart...');
        //await page.goto('https://mychart.bswhealth.com/DT/Authentication/Login');
        await this.page.goto('https://my.bswhealth.com');

        // Pre-populate login fields (but don't submit)
        try {
            // Read credentials from environment variables
            const username = process.env.MYBSWHEALTH_USERNAME;
            const password = process.env.MYBSWHEALTH_PASSWORD;

            if (!username || !password) {
                console.log('❌ Error: Missing credentials!');
                console.log('   Please set environment variables:');
                console.log('   - MYBSWHEALTH_USERNAME');
                console.log('   - MYBSWHEALTH_PASSWORD');
                throw new Error('Missing credentials');
            }

            console.log('🔐 Pre-populating login fields...');
            await this.page.waitForSelector('input#username', { timeout: 5000 });
            await this.page.fill('input#username', username);
            await this.page.fill('input#password', password);
            console.log('✅ Login fields pre-populated. Please click login when ready.');
        } catch (e) {
            if (e.message === 'Missing credentials') {
                throw e; // Re-throw credential errors
            }
            console.log('ℹ️  Login page not found - you may already be logged in.');
            console.log('   Continue with your navigation...');
        }
    }
    // #endregion

    urlIsExitPattern(url) {
        try {
            if (!this.exitUrlPattern) {
                return false;
            }
            return url.includes(this.exitUrlPattern);
        } catch (e) {
            console.log(`Error checking exit URL pattern for ${url}: ${e.message}`);
            return false;
        }
    }

    // find existing exchange or create new one
    find(params, eventType, allowAdd = true) {
        try {
            const url = Exchange.urlFromParams(params);
            const requestMethod = Exchange.requestMethodFromParams(params);
            const requestId = params.requestId;
            const frameId = params.frameId || null;        
            
            const requestIdExchange = requestId ? (this.exchanges.get(requestId) ?? null) : null;
            const frameIdExchange = frameId ? (this.exchangesByFrameId.get(frameId) ?? null) : null;
            const hasRequestIdExchange = requestIdExchange != null;
            const hasFrameIdExchange = frameIdExchange != null;

            var exchange = null;
            var matchType = null;
            if (hasRequestIdExchange) {
                exchange = requestIdExchange;
                matchType = 'requestId';
                if (exchange) {
                    // if the exchange doesn't have a url yet, and we have one now, set it
                    if (url && !exchange.url) {
                        // Mismatched URL, cannot use this exchange
                        exchange.url = url;
                    }
                    // if we have a request method, and the exchange doesn't have one yet, set it
                    if (requestMethod && (exchange.requestMethod == null || exchange.requestMethod == undefined || exchange.requestMethod == 'OPTIONS')) {
                        exchange.requestMethod = requestMethod;
                    }

                    // if the request methods match, return the exchange
                    if (requestMethod) {
                        if (exchange.requestMethod == requestMethod) {
                            return exchange;
                        }
                    } else {
                        return exchange;
                    }
                }
            }

            if (hasFrameIdExchange) {
                exchange = frameIdExchange;
                matchType = 'frameId';
                if (exchange) {
                    if (url) {
                        if (exchange.url == url) {
                            return exchange;
                        }
                    } else {
                        return exchange;
                    }
                }
            }

            if (exchange != null) {
                if (url && exchange.url != url) {
                    // Mismatched URL, cannot use this exchange
                    exchange = null;
                }
                if (exchange && requestMethod && exchange.requestMethod != requestMethod) {
                    // Mismatched request method, cannot use this exchange
                    exchange = null;
                }
                if (exchange != null) {
                    return exchange;
                }
            }

            if (allowAdd) {
                var exchange = new Exchange(this, params, url, eventType);
                return exchange;
            }

            return null;
        } catch (e) {
            console.log(`❌ Error finding/creating exchange: ${e.message}`);
        }
    }

    // saves captured exchanges to disk
    saveCaptures() {
        try {
            if (this.savedCaptures) {
                return;
            }
            this.savedCaptures = true;
            console.log('\n✅ Saving all captured data...');

            // Save to captures directory
            const outputDir = './captures';
            const bodiesDir = `${outputDir}/bodies`;

            try {
                fs.mkdirSync(bodiesDir, { recursive: true });
            } catch (e) {
                // Directory might already exist
            }
            try {
                fs.mkdirSync(outputDir, { recursive: true });
            } catch (e) {
                // Directory might already exist
            }

            const baseFileName = `cn-${this.exitUrlPattern.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}`;
            const baseFilePath = path.resolve(`${outputDir}/${baseFileName}.json`);

            const capturesFilePath = baseFilePath;
            const cookiesFilePath = baseFilePath.replace('.json', '-cookies.json');
            const allCapturesFilePath = baseFilePath.replace('.json', '-all.json');


            const allExchanges = Array.from(this.exchanges.values());
            const cookieExchanges = allExchanges.filter(e => e.hasCookies);   
            const bodyExchanges = allExchanges.filter(e => e.hasBody);   
            const captureExchanges = allExchanges.filter(e => e.shouldCapture);         

            // -------------------------------------------------------------
            // exchanges with cookies (either request or response)
            // -------------------------------------------------------------
            const cookieData = cookieExchanges.map((exchange, index) => {
                const originalRequest = exchange._originalRequest || exchange.request;
                return {
                    seq: index,
                    requestId: exchange.requestId,
                    url: exchange.url,
                    requestCookies: originalRequest ? originalRequest.requestCookies || [] : [],
                    responseCookies: exchange.response ? exchange.response.responseCookies || [] : []
                };
            });
            fs.writeFileSync(
                cookiesFilePath,
                JSON.stringify(cookieData, null, 2)
            );
            
            // -------------------------------------------------------------
            // exchanges with bodies - save out bodies to separate files
            // -------------------------------------------------------------
            bodyExchanges.forEach(exchange => {
                const safeFilename = exchange.bodyFileName;
                //const safeFilename = `body-${exchange.requestId.replace(/[^a-zA-Z0-9]/g, '-')}.txt`;
                const bodyPath = path.resolve(bodiesDir, safeFilename);
                fs.writeFileSync(
                    bodyPath,
                    exchange.response.body
                );
                exchange.response._bodyFile = bodyPath;
                // Remove body from main data to reduce size
                //delete exchange.response.body;
            });

            // -------------------------------------------------------------
            // exchanges not excluded by ignore patterns
            // -------------------------------------------------------------
            const captureData = {
                captureInfo: {
                    targetPattern: this.exitUrlPattern,
                    captureTime: new Date().toISOString(),
                    totalExchanges: captureExchanges.length,
                    completedExchanges: captureExchanges.filter(e => e.completed).length,
                    failedExchanges: captureExchanges.filter(e => !e.completed).length,
                    ignoredPatterns: Exchange.IGNORE_ENDPOINTS
                },
                exchanges: captureExchanges.map((exchange, index) => {
                    exchange.setRedirectsSequence(index);

                    const result = {
                        seq: index,
                        requestId: exchange.requestId,
                        url: exchange.url
                    };

                    // Add finalUrl if redirects occurred
                    if (exchange.finalUrl) {
                        result.finalUrl = exchange.finalUrl;
                    }

                    // Use original request if it exists (for redirected exchanges)
                    result.request = exchange._originalRequest ? exchange._originalRequest : exchange.request;
                    result.response = exchange.response || null;

                    // Add redirects array if any redirects occurred
                    if (exchange.redirects && exchange.redirects.length > 0) {
                        result.redirects = exchange.redirects;
                    }

                    result.eventsFired = exchange.eventNamesFired;
                    result.completed = exchange.completed;

                    return result;
                })
            };
            fs.writeFileSync(
                capturesFilePath,
                JSON.stringify(captureData, null, 2)
            );

            if (this.save_all_captures) {
                const allCaptureData = {
                    captureInfo: {
                        targetPattern: this.exitUrlPattern,
                        captureTime: new Date().toISOString(),
                        totalExchanges: allExchanges.length,
                        completedExchanges: allExchanges.filter(e => e.completed).length,
                        failedExchanges: allExchanges.filter(e => !e.completed).length,
                        ignoredPatterns: Exchange.IGNORE_ENDPOINTS
                    },
                    exchanges: allExchanges.map((exchange, index) => {
                        const result = {
                            seq: index,
                            requestId: exchange.requestId,
                            url: exchange.url
                        };

                        // Add finalUrl if redirects occurred
                        if (exchange.finalUrl) {
                            result.finalUrl = exchange.finalUrl;
                        }

                        // Use original request if it exists (for redirected exchanges)
                        result.request = exchange._originalRequest ? exchange._originalRequest : exchange.request;
                        result.response = exchange.response || null;

                        // Add redirects array if any redirects occurred
                        if (exchange.redirects && exchange.redirects.length > 0) {
                            result.redirects = exchange.redirects;
                        }

                        result.eventsFired = exchange.eventNamesFired;
                        result.completed = exchange.completed;

                        return result;
                    })
                };
                fs.writeFileSync(
                    allCapturesFilePath,
                    JSON.stringify(allCaptureData, null, 2)
                );
            }

            // -------------------------------------------------------------
            // final statistics along with file locations
            // -------------------------------------------------------------
            console.log(`📦 Total exchanges captured: ${allExchanges.length}`);
            console.log(`   ✅ Completed: ${captureData.captureInfo.completedExchanges}`);
            console.log(`   ❌ Failed/Incomplete: ${captureData.captureInfo.failedExchanges}`);             
            console.log(`   📊 Total exchanges not ignored: ${captureExchanges.length}`);
            console.log(`   📊 Total exchanges with cookies: ${cookieExchanges.length}`);
            console.log(`   📝 Total exchanges with bodies: ${bodyExchanges.length}`);   
            if (this.save_all_captures) {
                console.log(`💾 All captures saved to: ${allCapturesFilePath}`);
            }                      
            console.log(`💾 Captures saved to: ${capturesFilePath}`);
            console.log(`💾 Cookies saved to: ${cookiesFilePath}`);
            console.log(`💾 Bodies saved to: ${bodiesDir}`);
            console.log(`📊 Total captured: ${captureExchanges.length} exchanges`);


            // Show summary of test results API calls
            // const testResultsExchanges = exchanges.filter(e =>
            //     e.url.includes('test-results') || e.url.includes('LoadListData')
            // );

        } catch (e) {
            console.log(`❌ Error saving captures: ${e.message}`);
        }        // Implement saving logic here
    }
}

export class IDType {
    static ID_TYPES = {
        REQUEST_ID: 'requestId',
        LOADER_ID: 'loaderId',
        INTERCEPTION_ID: 'interceptionId',
        EXTRA_INFO_ID: 'extraInfoId'
    };


    constructor(idValue, fromEvent) {
        this.id = idValue;
        this.idType = IDType.idType(idValue, fromEvent);
    }


    static toIdType(idTypeValue) {
        switch (idTypeValue) {
            case ID_TYPES.requestId:
                return 'requestId';
            case ID_TYPES.loaderId:
                return 'loaderId';
            case ID_TYPES.interceptionId:
                return 'interceptionId';
            case ID_TYPES.extraInfoId:
                return 'extraInfoId';
        }
        return null;
    }

    static idType(id, from) {
        var retval = null;
        if (!id) {
            retval = -1;
        } 
        else 
        if (id.length >= 31) {
            retval = ID_TYPES.requestId;
        }
        console.log(`id ${id} is ${retval} (${toIdType(retval)}) from ${from}`);
        return retval;
    }
}