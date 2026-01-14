import { chromium } from 'playwright';
import { Exchange, Exchanges } from './exchange-lib.js';

async function captureEnhanced(exitUrlPattern) {
    if (!exitUrlPattern) {
        console.error('❌ Please provide a URL pattern to stop at');
        console.error('Usage: node capture-enhanced.js "GetDetails"');
        process.exit(1);
    }

    console.log(`🎯 Will capture ALL requests until we get RESPONSE for: "${exitUrlPattern}"`);

    // Store all network exchanges
    const networkExchanges = new Exchanges(exitUrlPattern, null);
    await networkExchanges.init();
    const client = networkExchanges.client;


    console.log('🔍 Using Chrome DevTools Protocol for comprehensive capture...');
    console.log(networkExchanges.ignoreEndpointsMessage);
    //console.log('📝 Filtering out:', IGNORE_ENDPOINTS.slice(0, 5).join(', '), '...');

    // ==============================================================
    // REQUEST EVENT HANDLERS
    // ==============================================================

    // Handle request interception - this ensures we get POST data
    client.on('Network.requestIntercepted', async (params) => {
        try {
            const eventType = Exchange.EVENT_TYPES.RequestIntercepted;
            var exchange = networkExchanges.find(params, eventType, true);

            if (exchange) {
                await exchange.requestIntercepted(params, eventType);
            } else {
                if (params.interceptionId) {
                    await client.send('Network.continueInterceptedRequest', {
                        interceptionId: params.interceptionId
                    });
                }
            }
        } catch (e) {
            console.log(`   ⚠️ Error handling intercepted request: ${e.message}`);
        }

    });

    // Listen for request will be sent (has cookies!)
    client.on('Network.requestWillBeSent', async (params) => {
        try {
            const eventType = Exchange.EVENT_TYPES.RequestWillBeSent;
            var exchange = networkExchanges.find(params, eventType, true);
            if (exchange) {
                await exchange.requestWillBeSent(params, eventType);
            }
            return;

            // // Skip ignored endpoints
            // if (shouldIgnoreUrl(url)) {
            //     return;
            // }

            // console.log(`${requestId} - requestWillBeSent received for ${url}`);

            // // Initialize or update the exchange
            // if (!networkExchanges.has(requestId)) {
            //     networkExchanges.set(requestId, {
            //         requestId: requestId,
            //         loaderId: params.loaderId,
            //         frameId: params.frameId,
            //         url: url,
            //         request: null,
            //         response: null,
            //         interceptedRequest: null,
            //         completed: false
            //     });
            // }

            // const exchange = networkExchanges.get(requestId);

            // exchange.requestWillBeSent(params);
            // // Track this request by URL for ExtraInfo correlation
            // recentRequestsByUrl.set(url, { loaderId: requestId, timestamp: params.timestamp });



            // // Log important requests
            // // if (url.includes('api/') || url.includes('test-results') || url.includes('OAuth')) {
            // //     console.log(`📥 ${params.request.method} ${url.substring(0, 80)}...`);
            // //     if (exchange.request.postData) {
            // //         console.log(`   📦 POST data: ${exchange.request.postData.substring(0, 100)}...`);
            // //     }
            // // }

            // // Check if this is our target URL
            // if (url.includes(urlPattern)) {
            //     console.log(`\n🎯 TARGET REQUEST FOUND! Waiting for response...`);

            //     // Set timeout to save after 10 seconds
            //     setTimeout(async () => {
            //         if (!targetResponseReceived) {
            //             console.log('\n⏱️ TIMEOUT: Saving capture after 10 seconds...');
            //             await saveCaptures();
            //             await browser.close();
            //             process.exit(0);
            //         }
            //     }, 10000);
            // }
        } catch (e) {
            console.log(`   ⚠️ Error handling requestWillBeSent: ${e.message}`);
        }
    });

    // Listen for extra info events (has even more cookie data!)
    // client.on('Network.requestWillBeSentExtraInfo', async (params) => {
    //     try {
    //         const requestId = params.requestId;
    //         const exchange = networkExchanges.get(requestId);
    //         if (exchange) {
    //             exchange.requestWillBeSentExtraInfo(params);
    //         }
    //         return;

    //         // const requestId = params.requestId;

    //         // // ExtraInfo events use a different ID scheme - need to map to loader ID
    //         // // We'll try to find the matching exchange by looking for recent requests
    //         // // that don't have cookies yet
    //         // const exchange = networkExchanges.get(requestId);
    //         // if (exchange) {
    //         //     if (params.associatedCookies && exchange.request) {
    //         //         if (params.associatedCookies.length > 0) {
    //         //             exchange.request.associatedCookies = params.associatedCookies;
    //         //         }
                    
    //         //     }
    //         // } else {
    //         //     console.log('⚠️  requestWillBeSentExtraInfo: No matching exchange for request ID ' + requestId);
    //         // }

    //         // return;

    //         // if (params.associatedCookies && params.associatedCookies.length > 0) {

    //         // }

    //         // // First check if we already mapped this ID
    //         // if (extraInfoIdToLoaderId.has(extraInfoId)) {
    //         //     loaderId = extraInfoIdToLoaderId.get(extraInfoId);
    //         //     exchange = networkExchanges.get(loaderId);
    //         // } else {
    //         //     // ExtraInfo events fire immediately after their corresponding main event
    //         //     // Find the LAST (most recent) exchange without cookies - it's likely the match
    //         //     const exchangeArray = Array.from(networkExchanges.entries());
    //         //     for (let i = exchangeArray.length - 1; i >= 0; i--) {
    //         //         const [id, ex] = exchangeArray[i];
    //         //         if (ex.request && !ex.request.cookies) {
    //         //             exchange = ex;
    //         //             loaderId = id;
    //         //             extraInfoIdToLoaderId.set(extraInfoId, loaderId);
    //         //             break;
    //         //         }
    //         //     }
    //         // }

    //         // if (!exchange) {
    //         //     console.log(`⚠️  requestWillBeSentExtraInfo: No matching exchange for extraInfo ID ${extraInfoId}`);
    //         //     return;
    //         // }

    //         // const url = exchange.url;

    //         // // Skip if ignored
    //         // if (shouldIgnoreUrl(exchange.url)) {
    //         //     return;
    //         // }

    //         // console.log(`${extraInfoId} -> ${loaderId} - requestWillBeSentExtraInfo received for ${url}`);

    //         // // Store the full cookie array directly in the request
    //         // if (params.associatedCookies && exchange.request) {
    //         //     exchange.request.cookies = params.associatedCookies;
    //         // }

    //         // // Update headers with the actual headers sent (more accurate than initial headers)
    //         // if (params.headers && exchange.request) {
    //         //     // Normalize headers to object format regardless of CDP version
    //         //     let normalizedHeaders = {};

    //         //     if (Array.isArray(params.headers)) {
    //         //         // Headers as array format [{name: "header", value: "value"}, ...]
    //         //         params.headers.forEach(h => {
    //         //             if (h.name && h.value) {
    //         //                 normalizedHeaders[h.name] = h.value;
    //         //             }
    //         //         });
    //         //     } else if (typeof params.headers === 'object') {
    //         //         // Headers already as object format
    //         //         normalizedHeaders = params.headers;
    //         //     }

    //         //     // Replace initial headers with actual headers sent
    //         //     exchange.request.headers = normalizedHeaders;
    //         // }

    //         // Log cookie info for important requests
    //         // if (params.associatedCookies && params.associatedCookies.length > 0 &&
    //         //     (exchange.url.includes('api/') || exchange.url.includes('test-results') || exchange.url.includes('OAuth'))) {
    //         //     console.log(`   🍪 ${params.associatedCookies.length} cookies sent`);
    //         //     const blockedCount = params.associatedCookies.filter(c => c.blockedReasons?.length > 0).length;
    //         //     if (blockedCount > 0) {
    //         //         console.log(`   ⚠️ ${blockedCount} cookies blocked`);
    //         //     }
    //         // }
    //     } catch (e) {
    //         console.log(`   ⚠️ Error handling requestWillBeSentExtraInfo: ${e.message}`);
    //     }
    // });

    client.on('Network.requestWillBeSentExtraInfo', async (params) => {
        try{
            const eventType = Exchange.EVENT_TYPES.RequestWillBeSentExtraInfo;
            const exchange = networkExchanges.find(params, eventType, true);
            if (exchange) {
                await exchange.requestWillBeSentExtraInfo(params, eventType);
            }
            return;
        } catch (e) {
            console.log(`   ⚠️ Error handling requestWillBeSentExtraInfo: ${e.message}`);
        }
    });    

    // ==============================================================
    // RESPONSE EVENT HANDLERS
    // ==============================================================

    client.on('Network.responseReceived', async (params) => {
        try {
            const eventType = Exchange.EVENT_TYPES.ResponseReceived;
            const exchange = networkExchanges.find(params, eventType, true);
            if (exchange) {
                await exchange.responseReceived(params, eventType);
            }                
        } catch (e) {
            console.log(`   ⚠️ Error handling responseReceived: ${e.message}`);
        }
    });

    // Listen for response extra info (has Set-Cookie details!)
    client.on('Network.responseReceivedExtraInfo', async (params) => {
        try {
            const eventType = Exchange.EVENT_TYPES.ResponseReceivedExtraInfo;
            const exchange = networkExchanges.find(params, eventType, true);
            if (exchange) {
                await exchange.responseReceivedExtraInfo(params, eventType);
            }
        } catch (e) {
            console.log(`   ⚠️ Error handling responseReceivedExtraInfo: ${e.message}`);
        }
    });



    // Listen for loading finished event - this is when body is ready
    client.on('Network.loadingFinished', async (params) => {
        try {
            const eventType = Exchange.EVENT_TYPES.LoadingFinished;
            const exchange = networkExchanges.find(params, eventType, false);
            if (exchange) {
                await exchange.loadingFinished(params, eventType);
            }
        } catch (e) {
            console.log(`   ⚠️ Error handling loadingFinished: ${e.message}`);
        }
    });

    // Listen for failed requests
    client.on('Network.loadingFailed', async (params) => {
        try {
            const eventType = Exchange.EVENT_TYPES.LoadingFailed;
            const exchange = networkExchanges.find(params, eventType, false);
            if (exchange) {
                await exchange.loadingFailed(params, eventType);
            }
        } catch (e) {
            console.log(`   ⚠️ Error handling loadingFailed: ${e.message}`);
        }
    });

    // const saveCaptures = async () => {
    //     try {
    //         console.log('\n✅ Saving all captured data...');

    //         // Save to data directory
    //         const outputDir = './data';
    //         try {
    //             await fs.mkdir(outputDir, { recursive: true });
    //         } catch (e) {
    //             // Directory might already exist
    //         }

    //         const filename = `${outputDir}/cn-${urlPattern.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.json`;
    //         const fullPath = path.resolve(filename);

    //         // Convert Map to array and filter out ignored URLs
    //         const exchanges = Array.from(networkExchanges.values())
    //             .filter(e => !shouldIgnoreUrl(e.url));

    //         // Create summary object with complete data
    //         const captureData = {
    //             captureInfo: {
    //                 targetPattern: urlPattern,
    //                 captureTime: new Date().toISOString(),
    //                 totalExchanges: exchanges.length,
    //                 completedExchanges: exchanges.filter(e => e.completed).length,
    //                 failedExchanges: exchanges.filter(e => !e.completed).length,
    //                 ignoredPatterns: IGNORE_ENDPOINTS
    //             },
    //             exchanges: exchanges.map(exchange => {
    //                 // Ensure we have POST data from either source
    //                 const postData = exchange.request?.postData ||
    //                                 exchange.interceptedRequest?.postData || null;

    //                 return {
    //                     requestId: exchange.requestId,
    //                     url: exchange.url,
    //                     request: exchange.request ? {
    //                         ...exchange.request,
    //                         postData: postData,
    //                         cookies: exchange.request.cookies || null
    //                         // cookies already stored directly in request
    //                     } : null,
    //                     response: exchange.response || null,
    //                     // response.cookies and response.blockedCookies already stored directly
    //                     completed: exchange.completed
    //                 };
    //             })
    //         };

    //         await fs.writeFile(
    //             fullPath,
    //             JSON.stringify(captureData, null, 2)
    //         );

    //         console.log(`💾 Saved to: ${fullPath}`);
    //         console.log(`📊 Total captured: ${exchanges.length} exchanges`);
    //         console.log(`   ✅ Completed: ${captureData.captureInfo.completedExchanges}`);
    //         console.log(`   ❌ Failed/Incomplete: ${captureData.captureInfo.failedExchanges}`);

    //         // Show summary of test results API calls
    //         // const testResultsExchanges = exchanges.filter(e =>
    //         //     e.url.includes('test-results') || e.url.includes('LoadListData')
    //         // );

    //         // if (testResultsExchanges.length > 0) {
    //         //     console.log('\n📋 Test Results API calls captured:');
    //         //     testResultsExchanges.forEach((exchange, idx) => {
    //         //         const method = exchange.request?.method || 'UNKNOWN';
    //         //         const status = exchange.response?.status || 'pending';
    //         //         const hasPost = exchange.request?.postData || exchange.interceptedRequest?.postData;
    //         //         const postIndicator = hasPost ? ' [POST data]' : '';
    //         //         console.log(`  ${idx + 1}. ${method} ${exchange.url.substring(0, 60)}...${postIndicator} → ${status}`);
    //         //     });
    //         // }

    //         console.log(`\n📁 Full capture saved to:`);
    //         console.log(`   ${fullPath}`);
    //     } catch (e) {
    //         console.log(`❌ Error saving captures: ${e.message}`);
    //     }
    // };

    // Navigate to MyChart
    
    await networkExchanges.navigateToMyBSWHealth();


    console.log('\n' + '='.repeat(60));
    console.log('📋 INSTRUCTIONS:');
    console.log('1. Click login button if needed');
    console.log('2. Navigate to test results and page through them');
    console.log('3. Click on a test result detail');
    console.log(`4. Script will capture everything and exit when it sees "${exitUrlPattern}"`);
    console.log('\n📝 Capturing:');
    console.log('   ✅ Request/response cookies');
    console.log('   ✅ POST data from all sources');
    console.log('   ✅ Complete headers and bodies');
    console.log('   ❌ Filtering out analytics and media files');
    console.log('='.repeat(60) + '\n');

    // Keep script running
    await new Promise(() => {});
}

// Run the capture
const pattern = process.argv[2] || 'GetDetails';
captureEnhanced(pattern);