'use strict';

const attribFC = require('./attribFC.js')();
const placeholderFC = require('./placeholderFC.js')();
const attribRecord = require('./attribRecord.js')();
const layerInterface = require('./layerInterface.js')();
const shared = require('./shared.js')();

/**
 * @class FeatureRecord
 */
class FeatureRecord extends attribRecord.AttribRecord {

    // TODO add flags for file based layers?

    /**
     * Create a layer record with the appropriate geoApi layer type.  Layer config
     * should be fully merged with all layer options defined (i.e. this constructor
     * will not apply any defaults).
     * @param {Object} layerClass    the ESRI api object for feature layers
     * @param {Object} esriRequest   the ESRI api object for making web requests with proxy support
     * @param {Object} apiRef        object pointing to the geoApi. allows us to call other geoApi functions.
     * @param {Object} config        layer config values
     * @param {Object} esriLayer     an optional pre-constructed layer
     * @param {Function} epsgLookup  an optional lookup function for EPSG codes (see geoService for signature)
     */
    constructor (layerClass, esriRequest, apiRef, config, esriLayer, epsgLookup) {
        // TEST STATUS basic
        // TODO if we have nothing to add here, delete this constructor
        // TODO might need to add a placeholder here with stuff like
        //    this._defaultFC = '0';
        //    this._featClasses['0'] = placeholder;
        super(layerClass, esriRequest, apiRef, config, esriLayer, epsgLookup);

        // handles placeholder symbol, possibly other things
        this._defaultFC = '0';
        this._featClasses['0'] = new placeholderFC.PlaceholderFC(this, this.name);

        this._geometryType = undefined;
        this._fcount = undefined;
    }

    // TODO ensure whoever is making layers from config fragments is also setting the feature index.
    //      remove comment once that is done

    makeLayerConfig () {
        // TEST STATUS basic
        const cfg = super.makeLayerConfig();
        cfg.mode = this.config.state.snapshot ? this._layerClass.MODE_SNAPSHOT
                                                        : this._layerClass.MODE_ONDEMAND;

        // TODO confirm this logic. old code mapped .options.snapshot.value to the button -- meaning if we were in snapshot mode,
        //      we would want the button disabled. in the refactor, the button may get it's enabled/disabled from a different source.
        // this.config.state.snapshot = !this.config.state.snapshot;
        this._snapshot = this.config.state.snapshot;

        return cfg;
    }

    getGeomType () {
        // TEST STATUS none
        // standard case, layer has no geometry. This gets overridden in feature-based Record classes.
        return this._geometryType;
    }

    // returns the proxy interface object for the root of the layer (i.e. main entry in legend, not nested child things)
    // TODO docs
    getProxy () {
        // TEST STATUS basic
        // TODO figure out control name arrays from config (specifically disabled stuff)
        //      updated config schema uses term "enabled" but have a feeling it really means available
        // TODO figure out how placeholders work with all this
        if (!this._rootProxy) {
            this._rootProxy = new layerInterface.LayerInterface(this, this.initialConfig.controls);
            this._rootProxy.convertToFeatureLayer(this);
        }
        return this._rootProxy;
    }

    /**
    * Triggers when the layer loads.
    *
    * @function onLoad
    */
    onLoad () {
        // TEST STATUS basic
        super.onLoad();

        // set up attributes, set up children bundles.
        const attributeBundle = this._apiRef.attribs.loadLayerAttribs(this._layer);

        // feature has only one layer
        const idx = attributeBundle.indexes[0];
        const aFC = new attribFC.AttribFC(this, idx, attributeBundle[idx], this.config);
        aFC.nameField = this.config.nameField;
        this._defaultFC = idx;
        this._featClasses[idx] = aFC;

        aFC.loadSymbology();

        // update asynch data
        aFC.getLayerData().then(ld => {
            this._geometryType = ld.geometryType;
        });

        this.getFeatureCount().then(fc => {
            this._fcount = fc;
        });

    }

    getFeatureCount () {
        // TEST STATUS basic
        // just use the layer url (or lack of in case of file layer)
        return super.getFeatureCount(this._layer.url);
    }

    isFileLayer () {
        // TEST STATUS none
        // TODO revisit.  is it robust enough?
        return this._layer && this._layer.url === '';
    }

    // TODO determine who is setting this. if we have an internal
    //      snapshot process, it might become a read-only property
    get isSnapshot () { return this._snapshot; }
    set isSnapshot (value) { this._snapshot = value; }

    get layerType () { return shared.clientLayerType.ESRI_FEATURE; }

    get featureCount () { return this._fcount; }

    onMouseOver (e) {
        // TEST STATUS none
        if (this._hoverListeners.length > 0) {
            // TODO add in quick lookup for layers that dont have attributes loaded yet

            const showBundle = {
                type: 'mouseOver',
                point: e.screenPoint,
                target: e.target
            };

            // tell anyone listening we moused into something
            this._fireEvent(this._hoverListeners, showBundle);

            // pull metadata for this layer.
            this.getLayerData().then(lInfo => {
                // TODO this will change a bit after we add in quick lookup. for now, get all attribs
                return Promise.all([Promise.resolve(lInfo), this.getAttribs()]);
            }).then(([lInfo, aInfo]) => {
                // graphic attributes will only have the OID if layer is server based
                const oid = e.graphic.attributes[lInfo.oidField];

                // get name via attribs and name field
                const featAttribs = aInfo.features[aInfo.oidIndex[oid]].attributes;
                const featName = this.getFeatureName(oid, featAttribs);

                // get icon via renderer and geoApi call
                const svgcode = this._apiRef.symbology.getGraphicIcon(featAttribs, lInfo.renderer);

                // duplicate the position so listener can verify this event is same as mouseOver event above
                const loadBundle = {
                    type: 'tipLoaded',
                    name: featName,
                    target: e.target,
                    svgcode
                };

                // tell anyone listening we moused into something
                this._fireEvent(this._hoverListeners, loadBundle);
            });
        }
    }

    onMouseOut (e) {
        // TEST STATUS none
        // tell anyone listening we moused out
        const outBundle = {
            type: 'mouseOut',
            target: e.target
        };
        this._fireEvent(this._hoverListeners, outBundle);
    }

    /**
    * Run a query on a feature layer, return the result as a promise.  Fills the panelData array on resolution. // TODO update
    * @function identify
    * @param {Object} opts additional argumets like map object, clickEvent, etc.
    * @returns {Object} an object with identify results array and identify promise resolving when identify is complete; if an empty object is returned, it will be skipped
    */
    identify (opts) {
        // TEST STATUS none
        // TODO add full documentation for options parameter

        // TODO fix these params
        // TODO legendEntry.name, legendEntry.symbology appear to be fast links to populate the left side of the results
        //      view.  perhaps it should not be in this object anymore?
        // TODO see how the client is consuming the internal pointer to layerRecord.  this may also now be
        //      directly available via the legend object.
        const identifyResult =
            new shared.IdentifyResult('legendEntry.name', 'legendEntry.symbology', 'EsriFeature',
                this, this._defaultFC);

        // run a spatial query
        const qry = new this._apiRef.layer.Query();
        qry.outFields = ['*']; // this will result in just objectid fields, as that is all we have in feature layers

        // more accurate results without making the buffer if we're dealing with extents
        // polygons from added file need buffer
        // TODO further investigate why esri is requiring buffer for file-based polygons. logic says it shouldnt
        if (this._layer.geometryType === 'esriGeometryPolygon' && !this.isFileLayer()) {
            qry.geometry = opts.geometry;
        } else {
            qry.geometry = this.makeClickBuffer(opts.clickEvent.mapPoint, opts.map, this.clickTolerance);
        }

        const identifyPromise = Promise.all([
                this.getAttributes(),
                Promise.resolve(this._layer.queryFeatures(qry)),
                this.getLayerData()
            ])
            .then(([attributes, queryResult, layerData]) => {
                // transform attributes of query results into {name,data} objects one object per queried feature
                //
                // each feature will have its attributes converted into a table
                // placeholder for now until we figure out how to signal the panel that
                // we want to make a nice table
                identifyResult.isLoading = false;
                identifyResult.data = queryResult.features.map(
                    feat => {
                        // grab the object id of the feature we clicked on.
                        const objId = feat.attributes[attributes.oidField];
                        const objIdStr = objId.toString();

                        // use object id find location of our feature in the feature array, and grab its attributes
                        const featAttribs = attributes.features[attributes.oidIndex[objIdStr]];
                        return {
                            name: this.getFeatureName(objIdStr, featAttribs),
                            data: this.attributesToDetails(featAttribs, layerData.fields),
                            oid: objId,
                            symbology: [
                                { svgcode: this._apiRef.symbology.getGraphicIcon(featAttribs, layerData.renderer) }
                            ]
                        };
                    });
            });

        return { identifyResults: [identifyResult], identifyPromise };
    }

}

module.exports = () => ({
    FeatureRecord
});
