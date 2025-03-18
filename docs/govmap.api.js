var govmap = {
    mapIframeId: "",
    mapUrl: "",
    urlWithProtocol: "",
    protocol: "",
    restBaseUrl: "ags.govmap.gov.il",
    routingBaseUrl: "route.govmap.gov.il/proxy/proxy.ashx",
    mapLoaded: $.Deferred(),
    authData: {
        api_token: '',
        user_token: '',
        domain: '',
        token: ''
    },
    mapFreeToProcess: $.Deferred().resolve(),
    bMapReceiverAttached: $.Deferred(),
    pOnError: $.Deferred(),
    authenticated: $.Deferred(),
    dictApiCallStatus: {},
    aApiCallDelegate: {},
    clickBinded: false,
    dictSelectFeatures: [],
    transportation: {
        startDepartureTime: "00:00",
        endDepartureTime: "23:59",
        numberOfDaysToAdd: 7
    },
    events: {
        PAN: 0,
        EXTENT_CHANGE: 1,
        CLICK: 3,
        DOUBLE_CLICK: 4,
        MOUSE_MOVE: 5,
        MOUSE_OVER: 8
    },
    internalClickEvents: {
        GET_XY_CLICK: 10,
        SELECTION: 11
    },
    locateType: {
        addressToLotParcel: 1,
        lotParcelToAddress: 0
    },
    cursorType: {
        DEFAULT: 0,
        TARGET: 1,
        POLYGON: 3,
        CIRCLE: 4,
        RECTANGLE: 5,
        SELECT_FEATURES: 6
    },
    geometryType: {
        POINT: 0,
        POLYLINE: 1,
        POLYGON: 2,
        LINE: 3,
        CIRCLE: 4
    },
    drawType: {
        Point: 0,
        Polyline: 1,
        Polygon: 2,
        Circle: 3,
        Rectangle: 4,
        FreehandPolygon: 6
    },
    rendererType: {
        Simple: 0,
        SimplePicture: 1,
        JenksNaturalBreaks: 2,
        EqualInterval: 3,
        Quantile: 4,
        ClassBreaks: 5
    },
    geocodeType: {
        FullResult: 0,
        AccuracyOnly: 1
    },
    saveAction: {
        Delete: 1,
        Update: 2,
        New: 3
    },
    saveActionStatus: {
        Failed: 0,
        Deleted: 1,
        Updated: 2,
        Inserted: 3
    },
    costing: {
        auto: "auto",
        auto_shorter: "auto_shorter",
        bicycle: "bicycle",
        multimodal: "multimodal",
        pedestrian: "pedestrian"
    },
    routing_type: {
        routing: "route",
        isochrone: "isochrone"
        
    },
    getRoutingServiceRoot: function () {
        return this.getProtocol() + govmap.routingBaseUrl;
    },
    getRestServiceRoot: function () {
        return this.getProtocol() + govmap.restBaseUrl;
    },
    getScriptHostUrl: function () {
        var scripts = document.getElementsByTagName('script');
        for (var i = 0; i < scripts.length; i++) {
            if (scripts[i].src == null)
                continue;
            var src = scripts[i].src.toLowerCase();
            if (src.indexOf("govmap.api.js") == -1)
                continue;
            this.protocol = this.getSchema(src);
            var charLength = src.indexOf("govmap/api");
            var fromPosition = src.indexOf("://") + 3;
            return src.substr(fromPosition, charLength - fromPosition);
        }
        return "";
    },
    getSchema: function (src) {
        var toPosition = src.indexOf("://");
        return src.substr(0, toPosition + 3);
    },
    postMapRequest: function (oRequest) {
        this.mapFreeToProcess = $.Deferred();
        oRequest.headers = { auth_data: JSON.stringify(govmap.authData) };
        this.getMapIframeWindow().postMessage(JSON.stringify(oRequest), '*');
    },
    post: function (url, data) {
        data = data || {};
        return $.ajax({
            url: url,
            headers: { auth_data: JSON.stringify(govmap.authData), "Content-Type": "application/json; charset=utf-8" },
            data: JSON.stringify(data),
            processData: true,
            dataType: "json",
            type: 'POST'
        }).fail(function (e) {
            if (e && e.status && e.status == 401) {
                console.log('Govmap API Token invalid or expired! ');
            }
            govmap.postError({
                "title": "אירעה שגיאה",
                "description": "אירעה שגיאה. זמנית, לא ניתן לבצע את הפעולה המבוקשת.",
                "errorCode": -1
            });
        });
    },
    getMapIframeWindow: function () {
        if (this.mapIframeId == "") {
            this.mapIframeId = this.getMapIframeId();
        }
        return document.getElementById(this.mapIframeId).contentWindow;
    },
    getMapIframeId: function () {
        var mapUrl = this.urlWithProtocol + "/map.html";
        var iframes = document.getElementsByTagName('iframe');
        for (var i = 0; i < iframes.length; i++) {
            var src = iframes[i].src.toLowerCase();
            if (src.indexOf(mapUrl) == -1)
                continue;
            return iframes[i].id;
        }
        return "";
    },
    getUrlWithProtocol: function () {
        return this.getProtocol() + this.mapUrl;
    },
    getProtocol: function () {
        return this.protocol;
    },
    getRequestId: function (requestType) {
        var requestId = requestType + (new Date).getTime();
        this.dictApiCallStatus[requestId] = true;
        setTimeout(function () { govmap.checkProcessStatus(requestId); }, 10000);
        return requestId;
    },
    checkProcessStatus: function (requestId) {
        if (this.dictApiCallStatus.hasOwnProperty(requestId) &&
            this.dictApiCallStatus[requestId] == true) {
            this.mapFreeToProcess.resolve();
            delete this.dictApiCallStatus[requestId];
        }
    },
    addDelegateToQueue: function (requestParams) {
        var requestId = requestParams.requestId;
        if ('eventId' in requestParams)
            requestId = requestParams.eventId;
        this.aApiCallDelegate[requestId] = $.Deferred();
        return this.aApiCallDelegate[requestId];
    },
    hasPromise: function (requestId) {
        return (requestId in this.aApiCallDelegate);
    },
    doProcess: function () {
        return $.when(this.mapFreeToProcess, this.mapLoaded, this.bMapReceiverAttached);
    },
    validJSON: function (json) {
        return (/^[\],:{}\s]*$/.test(json.replace(/\\["\\\/bfnrtu]/g, '@').
            replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']').
            replace(/(?:^|:|,)(?:\s*\[)+/g, '')));
    },
    postError: function (errObj) {
        if (this.onErrorCallback != null) {
            try {
                this.onErrorCallback(errObj);
            }
            catch (e) { }
        }
    },
    onError: function () {
        return govmap.pOnError;
    },
    authenticatedUser: function () {
        return govmap.authenticated.promise();
    },
    getMapRequest: function (request, bContinuous) {
        if (request.requestType == 'onEvent' ||
            request.requestType == 'unbindEvent') {
            switch (request.event) {
                case govmap.internalClickEvents.GET_XY_CLICK:
                    $.extend(request, {
                        "eventId": 'onEvent' + govmap.events.CLICK
                    });
                    request.event = govmap.events.CLICK;
                    break;
                case govmap.internalClickEvents.SELECTION:
                    $.extend(request, {
                        "eventId": 'onEvent' + govmap.events.CLICK
                    });
                    request.event = govmap.events.CLICK;
                    break;
                default:
                    $.extend(request, {
                        "eventId": 'onEvent' + request.event
                    });
            }
        }
        $.extend(request, {
            "requestId": (bContinuous) ? request.requestType : this.getRequestId(request.requestType)
        });
        return $.when(this.doProcess())
            .then(function () {
            return $.when(govmap.addDelegateToQueue(request), govmap.postMapRequest(request));
        });
    },
    resolvePromise: function (requestId, data, bNotify) {
        if (requestId in govmap.aApiCallDelegate) {
            if (!bNotify) {
                govmap.aApiCallDelegate[requestId].resolve(data);
                delete govmap.aApiCallDelegate[requestId];
            }
            else {
                govmap.aApiCallDelegate[requestId].notify(data);
            }
        }
    },
    isFunction: function (func) {
        return (func && typeof func == 'function');
    },
    validBackground: function (bg) {
        return !isNaN(bg);
    },
    createMap: function (targetDiv, options) {
        govmap.mapLoaded = $.Deferred();
        govmap.mapFreeToProcess = $.Deferred().resolve();
        govmap.bMapReceiverAttached = $.Deferred();
        govmap.pOnError = $.Deferred();
        govmap.authenticated = $.Deferred();
        var optionalParameters = {};
        var queryString = "?";
        var queryParams = new Array();
        queryParams.push("MapMode=1");
        queryParams.push("showNavBtn=0");
        queryParams.push("showBackBtn=0");
        if (typeof (options) == "object") {
            if (this.isFunction(options["onError"])) {
                govmap.pOnError.progress(function (e) {
                    options["onError"](e);
                });
            }
            if (this.isFunction(options["onClick"])) {
                this.onEvent(govmap.events.CLICK).progress(function (e) {
                    options["onClick"](e);
                });
            }
            if (this.isFunction(options["onPan"])) {
                this.onEvent(govmap.events.PAN).progress(function (e) {
                    options["onPan"](e);
                });
            }
            if (this.isFunction(options["onLoad"])) {
                govmap.mapLoaded.pipe(function () {
                    options.onLoad();
                });
            }
            this.setToken(options["token"] || "", options["user_token"] || "");
            if ("token" in options) {
                queryParams.push("api_token=" + (options.token));
            }
            queryParams.push("parentHost=" + document.domain);
            if ("visibleLayers" in options && options.visibleLayers.length > 0) {
                var visibleLayers = "lay=";
                visibleLayers += options.visibleLayers.join(",");
                queryParams.push(visibleLayers);
            }
            if ("layers" in options && options.layers.length) {
                var layers = "laym=";
                layers += options.layers.join(",");
                queryParams.push(layers);
            }
            if ("showXY" in options) {
                queryParams.push("xy=" + ((options.showXY) ? "1" : "0"));
            }
            if ("bgButton" in options) {
                queryParams.push("bb=" + ((options.bgButton) ? "1" : "0"));
            }
            if ("showBubble" in options) {
                queryParams.push("sbs=" + ((options.showBubble) ? "1" : "0"));
            }
            if ("zoomButtons" in options) {
                queryParams.push("zb=" + ((options.zoomButtons) ? "1" : "0"));
            }
            if ("background" in options) {
                if (govmap.validBackground(options.background)) {
                    queryParams.push("b=" + options.background);
                    optionalParameters["b"] = true;
                }
            }
            if ("identifyOnClick" in options) {
                queryParams.push("in=" + ((options.identifyOnClick) ? "1" : "0"));
            }
            if ("level" in options) {
                if (options.level >= 0 && options.level < 11)
                    queryParams.push("z=" + options.level);
            }
            if ("q" in options) {
                console.log("q in options. push to queryParams");
                queryParams.push("q=" + options.q);
            }
            if ("center" in options &&
                "x" in options.center &&
                "y" in options.center) {
                queryParams.push("c=" + options.center.x + "," + options.center.y);
            }
            if ("isEmbeddedToggle" in options) {
                queryParams.push("et=" + ((options.isEmbeddedToggle) ? "1" : "0"));
            }
            if ("setMapMarker" in options) {
                queryParams.push("mk=" + ((options.setMapMarker) ? "1" : "0"));
            }
            if ("layersMode" in options) {
                queryParams.push("lm=" + (options.layersMode));
            }
            if ("language" in options) {
                queryParams.push("lang=" + (options.language));
            }
            if ("transDate" in options) {
                queryParams.push("date=" + (options.transDate));
            }
            if ("transDepartureTime" in options) {
                queryParams.push("dt=" + (options.transDepartureTime));
            }
            if ("transRouteId" in options) {
                queryParams.push("ld=" + (options.transRouteId));
            }
            if ("transTripId" in options) {
                queryParams.push("ti=" + (options.transTripId));
            }
            if ("stationId" in options) {
                queryParams.push("stationId=" + (options.stationId));
            }
            if ("bubbleMaxWidth" in options) {
                queryParams.push("bmw=" + (options.bubbleMaxWidth));
            }
        }
        if (!("b" in optionalParameters))
            queryParams.push("b=0");
        var oTargetDiv = document.getElementById(targetDiv);
        var iMap = document.createElement("iframe");
        iMap.id = "ifrMap";
        iMap.style["width"] = "100%";
        iMap.style["height"] = "100%";
        iMap.style["border"] = "none";
        iMap.setAttribute("src", (this.urlWithProtocol + "/map.html") + ((queryParams.length > 0) ? (("?") + queryParams.join("&")) : ""));
        oTargetDiv.innerHTML = "";
        oTargetDiv.appendChild(iMap);
    },
    setAuthData: function (data) {
        this.authData = data;
        this.authenticated = govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/Auth", {}).then(function (result) {
            if (result) {
                govmap.authData = result;
                govmap.updateAuthData(result);
            }
        });
        return this.authenticated;
    },
    message_receiver: function (e) {
        e = e.originalEvent;
        if (govmap.urlWithProtocol.indexOf(e.origin) == 0) {
            if (!govmap.validJSON(e.data))
                return;
            var response = JSON.parse(e.data);
            if ("error" in response) {
                if (response.error != null && response.error.length > 0) {
                    govmap.pOnError.notify(response.error);
                }
            }
            var bNotify = false;
            switch (response.context) {
                case "map_loaded":
                    govmap.mapLoaded.resolve();
                    break;
                case "displayGeometries":
                    bNotify = true;
                    break;
                case "message_receiver_attached":
                    govmap.bMapReceiverAttached.resolve();
                    break;
                case "request_processed":
                    govmap.checkProcessStatus(response.data.requestId);
                    govmap.mapFreeToProcess.resolve();
                    break;
                case "onEvent":
                    bNotify = true;
                    response.requestId = response.eventId;
                    break;
                case "draw":
                    bNotify = ("notify" in response.data) ? response.data.notify : true;
                    response.requestId = response.context;
                    break;
                case "selectFeaturesOnMap":
                    break;
            }
            govmap.resolvePromise(response.requestId, response.data, bNotify);
        }
    },
    setToken: function (token, user_token) {
        govmap.authData["api_token"] = token;
        govmap.authData["user_token"] = user_token;
        govmap.authenticated = $.Deferred();
        govmap.setAuthData(govmap.authData);
    },
    onEvent: function (event, continousMode) {
        if (continousMode === void 0) { continousMode = true; }
        var requestType = 'onEvent';
        var request = {
            'requestType': requestType,
            'event': event
        };
        return this.getMapRequest(request, continousMode);
    },
    unbindEvent: function (event) {
        var requestType = 'unbindEvent';
        var request = {
            'requestType': requestType,
            'event': event
        };
        return this.getMapRequest(request, false);
    },
    saveLayerEntities: function (params) {
        return govmap.authenticatedUser().then(function () {
            if ("entities" in params) {
                for (var i = 0; i < params["entities"].length; i++) {
                    var entity = params["entities"][i];
                    if ("fields" in entity)
                        entity["fields"] = JSON.stringify(entity["fields"]);
                }
            }
            return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/SaveLayerEntities", params);
        });
    },
    setLayerOpacity: function (params) {
        if (!('layerName' in params) ||
            !('opacity' in params))
            return;
        var requestType = 'setLayerOpacity';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    showLabels: function (params) {
        if (!('layerName' in params) ||
            !('showLabels' in params))
            return;
        var requestType = 'showLabels';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    getLayerEntities: function (params) {
        return govmap.authenticatedUser().then(function () {
            return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetUserLayerEntities", params);
        });
    },
    getAddEntitiesSample: function (params) {
        return govmap.authenticatedUser().then(function () {
            return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetAddEntitiesSample", params);
        });
    },
    refreshResource: function (params) {
        if (!('resource' in params) &&
            !('layerName' in params))
            return;
        var requestType = 'refreshResource';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    getLayerDef: function (params) {
        if (params.layerName == "")
            return "";
        var requestType = 'getLayerDef' + (Date.now() + Math.random()).toString();
        var request = {
            'requestType': requestType,
            'layerName': params.layerName,
            'whereClause': "whereClause" in params ? params.whereClause : ""
        };
        return this.getMapRequest(request, false);
    },
    intersectFeatures: function (params) {
        return govmap.authenticatedUser().then(function () {
            return govmap.getLayerDef(params).then(function (layerDef) {
                if (layerDef != null && layerDef != "") {
                    params.whereClause = layerDef;
                }
                return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/IntersectsFeatures", params);
            });
        });
    },
    intersectFeaturesByWhereClause: function (params) {
        return govmap.authenticatedUser().then(function () {
            return govmap.getLayerDef(params).then(function (layerDef) {
                if (layerDef != null && layerDef != "") {
                    if (params.whereClause != null && params.whereClause != "") {
                        params.whereClause = params.whereClause + " and " + layerDef;
                    }
                    else {
                        params.whereClause = layerDef;
                    }
                }
                return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/intersectFeaturesByWhereClause", params);
            });
        });
    },
    searchAndLocate: function (params) {
        return govmap.authenticatedUser().then(function () {
            return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/SearchAndLocate", params);
        });
    },
    setBackground: function (backgroundId) {
        if (!govmap.validBackground(backgroundId)) {
            console.log('background id must be a number!');
            return;
        }
        var requestType = 'setBackground';
        var request = {
            'requestType': requestType,
            'backgroundId': backgroundId
        };
        return this.getMapRequest(request, false);
    },
    setMapCursor: function (cursor) {
        var requestType = 'setMapCursor';
        var request = {
            'requestType': requestType,
            'cursor': cursor
        };
        return this.getMapRequest(request, false);
    },
    setDefaultTool: function () {
        var requestType = 'setDefaultTool';
        var request = {
            'requestType': requestType
        };
        govmap.dictSelectFeatures = [];
        govmap.unbindEvent(govmap.internalClickEvents.GET_XY_CLICK);
        govmap.unbindEvent(govmap.internalClickEvents.SELECTION);
        return this.getMapRequest(request, false);
    },
    showMeasure: function () {
        var requestType = 'showMeasure';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, true);
    },
    showPrint: function (height, width) {
        var requestType = 'showPrint';
        var request = {
            'requestType': requestType,
            'height': height,
            'width': width
        };
        return this.getMapRequest(request, false);
    },
    showExportMap: function () {
        var requestType = 'showExportMap';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    closeBubble: function () {
        var requestType = 'closeBubble';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    draw: function (type) {
        var requestType = 'draw';
        var request = {
            'requestType': requestType,
            'type': type
        };
        return this.getMapRequest(request, true);
    },
    displayGeometries: function (data) {
        if (data.showBubble === undefined || data.showBubble === null) {
            data.showBubble = true;
        }
        var requestType = 'displayGeometries';
        var request = {
            'requestType': requestType,
            'data': data
        };
        return this.getMapRequest(request, true);
    },
    clearSelection: function () {
        var requestType = 'clearSelection';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    clearDrawings: function () {
        var requestType = 'clearDrawings';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    clearGeometriesByName: function (names) {
        var requestType = 'clearGraphicsByName';
        var request = {
            'requestType': requestType,
            'names': names
        };
        return this.getMapRequest(request, false);
    },
    clearGeometriesById: function (ids) {
        var requestType = 'clearGraphicsById';
        var request = {
            'requestType': requestType,
            'ids': ids
        };
        return this.getMapRequest(request, false);
    },
    zoomToXY: function (params) {
        var requestType = 'zoomToXY';
        var request = {
            'requestType': requestType,
        };
        $.extend(request, params);
        return this.getMapRequest(request, false);
    },
    clearMapMarker: function () {
        var requestType = 'clearMapMarker';
        var request = {
            'requestType': requestType,
        };
        return this.getMapRequest(request, false);
    },
  setMapMarker(params)
    {
        //x - x coordinate
        //y - y coordinate
        var requestType = 'setMapMarker';
        var request = {
            'requestType': requestType,
        };
 $.extend(request, params);
        return this.getMapRequest(request, false);
    },
    getXY: function () {
        govmap.setMapCursor(govmap.cursorType.TARGET);
        return govmap.onEvent(govmap.internalClickEvents.GET_XY_CLICK);
    },
    geocode: function (params) {
        return govmap.authenticatedUser().then(function () {
            return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/Geocode", params);
        });
    },
    getFreeSearchResult: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetFreeSearchResult", params);
    },
    setDrawPointTooltip: function (params) {
        var requestType = 'setDrawPointTooltip';
        var request = {
            'requestType': requestType,
            'tooltipText': params
        };
        return this.getMapRequest(request, true);
    },
    gpsOn: function () {
        var requestType = 'gpsOn';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    gpsOff: function () {
        var requestType = 'gpsOff';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    getGPSLocation: function () {
        var requestType = 'getGPSLocation';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    setGpsMarker: function (gpsdata) {
        var requestType = 'setGpsMarker';
        var request = {
            'requestType': requestType,
            'x': gpsdata.x,
            'y': gpsdata.y,
            'accuracy': gpsdata.accuracy
        };
        return this.getMapRequest(request, true);
    },
    removeGPSMarker: function () {
        var requestType = 'removeGPSMarker';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    getInScaleVisibleLayers: function () {
        var requestType = 'getInScaleVisibleLayers';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
	showBubble(data){
		var requestType = 'showBubble';
        var request = {
            'requestType': requestType,
            'data': data
        };
        return this.getMapRequest(request, false);
	},
	 identifyByXYAndLayer: function (x, y, lyrs) {
       
        return    govmap.getMapTolerance().then(function (tolerance) {
                var oLayers = [];
                for (var i in lyrs) {
                    oLayers.push({
                        "LayerType": 8,
                        "LayerName": lyrs[i]
                    });
                }
                var params = {
                    "x": x,
                    "y": y,
                    "mapTolerance": tolerance,
                    "layers": oLayers
                };
                return govmap.post(govmap.getRestServiceRoot() + "/Identify/IdentifyByXY", params);
            });
        
    },
    identifyByXY: function (x, y) {
       return govmap.getInScaleVisibleLayers().then(function (layers) {
          return  govmap.getMapTolerance().then(function (tolerance) {
                var oLayers = [];
                for (var i in layers.layers) {
                    oLayers.push({
                        "LayerType": 8,
                        "LayerName": layers.layers[i]
                    });
                }
                var params = {
                    "x": x,
                    "y": y,
                    "mapTolerance": tolerance,
                    "layers": oLayers
                };
                return govmap.post(govmap.getRestServiceRoot() + "/Identify/IdentifyByXY", params);
            });
        });
    },
    getMapTolerance: function () {
        var requestType = 'getMapTolerance';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    setVisibleLayers: function (layersOn, layersOff) {
        var requestType = 'setVisibleLayers';
        var request = {
            'requestType': requestType,
            layersOn: layersOn,
            layersOff: layersOff
        };
        return this.getMapRequest(request, false);
    },
    setHeatLayer: function (params) {
        var requestType = 'setHeatLayer';
        var request = {
            'requestType': requestType,
            points: params.points,
            options: params.options
        };
        return this.getMapRequest(request, false);
    },
    removeHeatLayer: function () {
        var requestType = 'removeHeatLayer';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    changeHeatLayerValueField: function (valueField) {
        var requestType = 'changeHeatLayerValueField';
        var request = {
            'requestType': requestType,
            valueField: valueField
        };
        return this.getMapRequest(request, false);
    },
    getLayerData: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetLayerEntitiesByXY", { LayerName: params.LayerName, Radius: params.Radius, Point: params.Point });
    },
    getLayerRenderer: function (layers) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetLayerRenderer", layers);
    },
    getResourceLayersInfo: function (resourceName) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetResourceLayersInfo", resourceName);
    },
    addCustomBackground: function (params) {
        var requestType = 'addCustomBackground';
        var request = {
            'requestType': requestType,
            background: params
        };
        return this.getMapRequest(request, false);
    },
    addAuthorizedBackground: function (bgId) {
        var pointerThis = this;
        return govmap.authenticatedUser().then(function () {
            govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/AddAuthorizedBg", { "bgId": bgId }).then(function (result) {
                return pointerThis.addCustomBackground(result.data);
            });
        });
    },
    updateAuthData: function (authData) {
        var requestType = 'updateAuthData';
        var request = {
            'requestType': requestType,
            'authData': authData
        };
        return this.getMapRequest(request, false);
    },
    getLegend: function (params) {
        var requestType = 'getLegend';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    addOpenSourceLayer: function (params) {
        var requestType = 'addOpenSourceLayer';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    searchInLayer: function (params) {
        var _this = this;
        var pointerThis = this;
        return govmap.authenticatedUser().then(function () {
            govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/SelectionParams", { "layerName": params.layerName, "fieldName": params.fieldName, "fieldValues": params.fieldValues, "interfaceName": params.interfaceName }).then(function (result) {
                var requestType = 'searchInLayer';
                var request = {
                    'requestType': requestType,
                    'selectionParams': result.data,
                    'params': params
                };
                return _this.getMapRequest(request, false);
            });
        });
    },
    setMapSelection: function (params) {
        var requestType = 'setMapSelection';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    intersectFeaturesLongGeom: function (params) {
        return govmap.getLayerDef(params).then(function (layerDef) {
            if (layerDef != null && layerDef != "") {
                params.whereClause = layerDef;
            }
            return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/IntersectLongGeometry", params);
        });
    },
    _selectFeatures: function (interfaceName, wkt, tolerance, drawType, continous, defer) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/SelectFeatures", { "wkt": wkt, "interfaceName": interfaceName, "tolerance": tolerance })
            .then(function (result) {
            if (!result || !result.data || !result.data.Values) {
                var err = {
                    error: 'no data'
                };
                if (continous) {
                    defer.notify(err);
                }
                else {
                    defer.resolve(err);
                }
                return;
            }
            for (var key in result.data.Values) {
                if (!govmap.dictSelectFeatures.hasOwnProperty(result.data.Values[key])) {
                    govmap.dictSelectFeatures[key] = result.data.Values[key];
                }
            }
            var lstObj = "";
            var returnValues = [];
            for (var k in govmap.dictSelectFeatures) {
                lstObj += k + ",";
                returnValues.push(govmap.dictSelectFeatures[k]);
            }
            lstObj = lstObj.substring(0, lstObj.length - 1);
            result.data.SelectionParams.filter = "ObjectId in (" + lstObj + ")";
            govmap.clearDrawings();
            govmap.setMapSelection(result.data.SelectionParams);
            if (continous) {
                defer.notify({
                    data: returnValues,
                    selection: result.data.SelectionParams,
                    limited: result.data.limitedResult
                });
            }
            else {
                defer.resolve({
                    data: returnValues,
                    selection: result.data.SelectionParams,
                    limited: result.data.limitedResult
                });
            }
        });
    },
    toWKT: function (geometry) {
        if ("x" in geometry && "y" in geometry) {
            geometry.type = "point";
        }
        switch (geometry.type) {
            case "extent":
                return govmap._extentToWKT(geometry);
            case "point":
                return govmap._pointToWKT(geometry);
            case "polyline":
                return govmap._polylineToWKT(geometry);
            case "polygon":
                return govmap._polygonToWKT(geometry);
        }
        return null;
    },
    _pointToWKT: function (geometry) {
        return 'POINT(' + geometry.x + ' ' + geometry.y + ')';
    },
    _polylineToWKT: function (geometry) {
        var coordSeparator = ' ';
        var pntSeperator = ', ';
        var path = geometry.paths[0];
        var pntCount = path.length;
        if (pntCount == 0)
            return '';
        var sb = new Array();
        sb.push(path[0][0].toFixed(2) + coordSeparator + path[0][1].toFixed(2));
        for (var idx = 1; idx < pntCount; idx++) {
            sb.push(pntSeperator);
            sb.push(path[idx][0].toFixed(2) + coordSeparator + path[idx][1].toFixed(2));
        }
        return "LINESTRING(" + sb.join("") + ")";
    },
    _polygonToWKT: function (geometry) {
        var coordSeparator = ' ';
        var pntSeperator = ', ';
        var ring = geometry.rings[0];
        var pntCount = ring.length;
        if (pntCount == 0)
            return '';
        var sb = new Array();
        sb.push(ring[0][0].toFixed(2) + coordSeparator + ring[0][1].toFixed(2));
        for (var idx = 1; idx < pntCount; idx++) {
            sb.push(pntSeperator);
            sb.push(ring[idx][0].toFixed(2) + coordSeparator + ring[idx][1].toFixed(2));
        }
        if (ring[0][0] != ring[pntCount - 1][0] || ring[0][1] != ring[pntCount - 1][1]) {
            sb.push(pntSeperator);
            sb.push(ring[0][0].toFixed(2) + coordSeparator + ring[0][1].toFixed(2));
        }
        return "POLYGON((" + sb.join("") + "))";
    },
    _extentToWKT: function (geometry) {
        return 'POLYGON((' + geometry.xmin + ' ' + geometry.ymin + ','
            + geometry.xmax + ' ' + geometry.ymin + ','
            + geometry.xmax + ' ' + geometry.ymax + ','
            + geometry.xmin + ' ' + geometry.ymax + ','
            + geometry.xmin + ' ' + geometry.ymin + '))';
    },
    selectFeaturesOnMap: function (interfaceName, drawType, continous) {
        if (continous === void 0) { continous = false; }
        var pointerThis = this;
        var defer = $.Deferred();
        govmap.dictSelectFeatures = [];
        if (typeof (drawType) === "object") {
            govmap._selectFeatures(interfaceName, govmap.toWKT(drawType), 0, 0, false, defer);
        }
        else {
            if (drawType == 0) {
                govmap.setDrawPointTooltip("בחר במפה");
            }
            govmap.draw(drawType).progress(function (e) {
                govmap._selectFeatures(interfaceName, e.wkt, e.tolerance, drawType, continous, defer);
                if (drawType == 0) {
                    govmap.setDrawPointTooltip("לחץ במיקום המבוקש");
                }
            });
        }
        return defer.promise();
    },
    zoomToDrawing: function () {
        var requestType = 'zoomToDrawing';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    filterLayers: function (params) {
        var request = {
            'requestType': 'filterLayers',
            layerName: params.layerName,
            whereClause: params.whereClause,
            zoomToExtent: params.zoomToExtent
        };
        return this.getMapRequest(request, false);
    },
    zoomIn: function () {
        var request = {
            'requestType': 'zoomIn'
        };
        return this.getMapRequest(request, false);
    },
    zoomOut: function () {
        var request = {
            'requestType': 'zoomOut'
        };
        return this.getMapRequest(request, false);
    },
    zoomToExtent: function (params) {
        var request = {
            'requestType': 'zoomToExtent',
            xmin: params.xmin,
            ymin: params.ymin,
            xmax: params.xmax,
            ymax: params.ymax
        };
        return this.getMapRequest(request, false);
    },
    openTransporatationApp: function () {
        var requestType = 'openTransporatationApp';
        var request = {
            'requestType': requestType
        };
        return this.getMapRequest(request, false);
    },
    findLine: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/FindLine", params);
    },
    getSpecificLine: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetSpecificLine", params);
    },
    getStationArrivalTimes: function (params) {
        if (!params.StartDate) {
            params.StartDate = govmap.dateFormat(new Date());
        }
        if (!params.StartDepartureTime) {
            params.StartDepartureTime = govmap.transportation.startDepartureTime;
        }
        if (!params.EndDate) {
            var dateArray = params.StartDate.split("/");
            var startDate = new Date(dateArray[2], dateArray[1] - 1, dateArray[0]);
            var endDate = startDate;
            endDate.setDate(startDate.getDate() + govmap.transportation.numberOfDaysToAdd);
            params.EndDate = govmap.dateFormat(endDate);
        }
        if (!params.EndDepartureTime) {
            params.EndDepartureTime = govmap.transportation.endDepartureTime;
        }
        return govmap.post(govmap.getRestServiceRoot() + "/Api/Controllers/GovmapApi/GetStationArrivals", params);
    },
    zoomToTransportationLine: function (params) {
        var requestType = 'zoomToTransportationLine';
        var request = {
            'requestType': requestType,
            'params': params
        };
        return this.getMapRequest(request, false);
    },
    dateFormat: function (date) {
        var dd = date.getDate();
        var mm = date.getMonth() + 1;
        var yyyy = date.getFullYear();
        if (dd < 10) {
            dd = '0' + dd;
        }
        if (mm < 10) {
            mm = '0' + mm;
        }
        return dd + '/' + mm + '/' + yyyy;
    },
    projLocations: function (locations) {
        var requestType = 'projFromITMToWGS';
        var request = {
            'requestType': requestType,
            'params': locations
        };
        return this.getMapRequest(request, false);
    },
    getLocationsFromAdresses: function (addresses) {
        return govmap.post(govmap.getRestServiceRoot() + '/Api/Controllers/GovmapApi/GetAdressesWgsCoord', { 'keywords': addresses });
    },
    getLocations: function (params) {
        if (params.locations)
            return govmap.projLocations(params.locations);
        else if (params.adresses)
            return govmap.getLocationsFromAdresses(params.adresses);
    },
    getRoutingData: function (params) {
        return govmap.getLocations(params)
            .then(function (result) {
            var url = govmap.getRoutingServiceRoot() +'?' + params.routing_type + '?json=';
            var json = {
                locations: (result && "data" in result && result.data) ? result.data : result,
                costing: params.costing
            };
if("params" in params && params.params)
{
json = $.extend(json,params.params);
}
            url += JSON.stringify(json);
            return $.getJSON(url, function (routes) {
                console.log("success");
            });
        });
    },
    getSearchItem: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + '/AdvancedSearch/GetSearchItem', params);
    },
    getSearchComponentValues: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + '/AdvancedSearch/GetSearchComponentValues', params);
    },
    predefinedsearch: function (params) {
        return govmap.post(govmap.getRestServiceRoot() + '/Search/PredefinedSearch', params);
    }
};
window.govmap = govmap;
govmap.mapUrl = govmap.getScriptHostUrl();
govmap.urlWithProtocol = govmap.getUrlWithProtocol();
$(window).on("message", govmap.message_receiver);
