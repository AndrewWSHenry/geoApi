'use strict';

const attribRecord = require('./attribRecord.js')();
const shared = require('./shared.js')();
const placeholderFC = require('./placeholderFC.js')();
const layerInterface = require('./layerInterface.js')();
const dynamicFC = require('./dynamicFC.js')();
const attribFC = require('./attribFC.js')();

/**
 * @class DynamicRecord
 */
class DynamicRecord extends attribRecord.AttribRecord {
    // TODO are we still using passthrough stuff?
    get _layerPassthroughBindings () {
        // TEST STATUS none
        return ['setOpacity', 'setVisibility', 'setVisibleLayers', 'setLayerDrawingOptions'];
    }
    get _layerPassthroughProperties () {
        // TEST STATUS none
        return ['visibleAtMapScale', 'visible', 'spatialReference', 'layerInfos', 'supportsDynamicLayers'];
    }

    get layerType () { return shared.clientLayerType.ESRI_DYNAMIC; }
    get isTrueDynamic () { return this._isTrueDynamic; }

    /**
     * Create a layer record with the appropriate geoApi layer type.
     * Regarding configuration -- in the standard case, the incoming config object
     * will be incomplete with regards to child state. It may not even have entries for all possible
     * child sub-layers.  Given our config defaulting for children happens AFTER the layer loads,
     * it means what is passed in at the constructor is generally unreliable except for any child names,
     * and the class will treat that information as unreliable (the UI will set values after config defaulting
     * happens). In the rare case where the config is fully formed and we want to take advantage of that,
     * set the configIsComplete param to true.  Be aware that if the config is not actually complete you may
     * get a layer in an undesired initial state.
     *
     * @param {Object} layerClass         the ESRI api object for dynamic layers
     * @param {Object} esriRequest        the ESRI api object for making web requests with proxy support
     * @param {Object} apiRef             object pointing to the geoApi. allows us to call other geoApi functions
     * @param {Object} config             layer config values
     * @param {Object} esriLayer          an optional pre-constructed layer
     * @param {Function} epsgLookup       an optional lookup function for EPSG codes (see geoService for signature)
     * @param {Boolean} configIsComplete  an optional flag to indicate if the config is fully flushed out (i.e. things defined for all children). Defaults to false.
     */
    constructor (layerClass, esriRequest, apiRef, config, esriLayer, epsgLookup, configIsComplete = false) {
        // TEST STATUS basic
        super(layerClass, esriRequest, apiRef, config, esriLayer, epsgLookup);
        this.ArcGISDynamicMapServiceLayer = layerClass;
        this._configIsComplete = configIsComplete;

        // TODO what is the case where we have dynamic layer already prepared
        //      and passed in? Generally this only applies to file layers (which
        //      are feature layers).

        this._proxies = {};

        // marks if layer supports dynamic capabilities, like child opacity, renderer change, layer reorder
        this._isTrueDynamic = false;

    }

    /**
     * Return a proxy interface for a child layer
     *
     * @param {Integer} featureIdx    index of child entry (leaf or group)
     * @return {Object}               proxy interface for given child
     */
    getChildProxy (featureIdx) {
        // TODO verify we have integer coming in and not a string
        // NOTE we no longer have group proxies. Since it is possible for a proxy to
        //      be requested prior to a dynamic layer being loaded (and thus have no
        //      idea of the index is valid or the index is a group), we always give
        //      a proxy and depend on the caller to be smart about it.

        const strIdx = featureIdx.toString();
        if (this._proxies[strIdx]) {
            return this._proxies[strIdx];
        } else {
            // throw new Error(`attempt to get non-existing child proxy. Index ${featureIdx}`);

            // to handle the case of a structured legend needing a proxy for a child prior to the
            // layer loading, we treat an unknown proxy request as that case and return
            // a proxy loaded with a placeholder.
            // TODO how to pass in a name? add an optional second parameter? expose a "set name" on the proxy?
            const pfc = new placeholderFC.PlaceholderFC(this, '');
            const tProxy = new layerInterface.LayerInterface(pfc);
            tProxy.convertToPlaceholder(pfc);
            this._proxies[strIdx] = tProxy;
            return tProxy;

        }
    }

    // TODO docs
    getFeatureCount (featureIdx) {
        // point url to sub-index we want
        // TODO might change how we manage index and url
        return super.getFeatureCount(this._layer.url + '/' + featureIdx);
    }

    /**
    * Triggers when the layer loads.
    *
    * @function onLoad
    */
    onLoad () {
        super.onLoad();
        this._isTrueDynamic = this._layer.supportsDynamicLayers;

        // don't worry about structured legend. the legend part is separate from
        // the layers part. we just load what we are told to. the legend module
        // will handle the structured part.

        // NOTE for now, the only relevant properties to be propagated
        //      from parent to child are .state and .controls .
        //      .outfields does not make sense as chilren can have different fields.
        //      We assume the objects at the layer level (index -1) are fully defaulted.
        //      All other missing items assigned from parent item.

        // collate any relevant overrides from the config.
        const subConfigs = {};

        this.config.layerEntries.forEach(le => {
            subConfigs[le.index.toString()] = {
                config: JSON.parse(JSON.stringify(le)),
                defaulted: this._configIsComplete
            };
        });

        // subfunction to return a subconfig object.
        // if it does not exist or is not defaulted, will do that first
        // id param is an integer in string format
        const fetchSubConfig = (id, serverName = '')  => {
            // snapshot and bounding box don't apply to child layers
            const dummyState = {
                opacity: 1,
                visibility: false,
                query: false
            };

            if (subConfigs[id]) {
                const subC = subConfigs[id];
                if (!subC.defaulted) {
                    // config is incomplete, fill in blanks
                    // we will never hit this code block a complete config was passed in
                    // (because it will already have defaulted === true).
                    // that means our state is unreliable and will be overwritten with a default

                    subC.config.state = Object.assign({}, dummyState);

                    // default outfields if not already there
                    if (!subC.config.hasOwnProperty('outfields')) {
                        subC.config.outfields = '*';
                    }

                    // apply a server name if no name exists
                    if (!subC.config.name) {
                        subC.config.name = serverName;
                    }

                    // mark as defaulted so we don't do this again
                    subC.defaulted = true;
                }
                return subC.config;
            } else {
                // no config at all. we apply defaults, and a name from the server if available
                const newConfig = {
                    name: serverName,
                    state: Object.assign({}, dummyState),
                    outfields: '*',
                    index: parseInt(id),
                    stateOnly: true
                };
                subConfigs[id] = {
                    config: newConfig,
                    defaulted: true
                };
                return newConfig;
            }
        };

        // this subfunction will recursively crawl a dynamic layerInfo structure.
        // it will generate proxy objects for all groups and leafs under the
        // input layerInfo.
        // we also generate a tree structure of layerInfos that is in a format
        // that makes the client happy
        const processLayerInfo = (layerInfo, treeArray) => {
            const sId = layerInfo.id.toString();
            const subC = fetchSubConfig(sId, layerInfo.name);

            if (layerInfo.subLayerIds && layerInfo.subLayerIds.length > 0) {
                // group sublayer
                const treeGroup = {
                    entryIndex: layerInfo.id,
                    name: subC.name,
                    childs: []
                };
                treeArray.push(treeGroup);

                // process the kids in the group.
                // store the child leaves in the internal variable
                layerInfo.subLayerIds.forEach(slid => {
                    processLayerInfo(this._layer.layerInfos[slid], treeGroup.childs);
                });

            } else {
                // leaf

                const pfc = new placeholderFC.PlaceholderFC(this, subC.name);
                if (this._proxies[sId]) {
                    // we have a pre-made proxy (structured legend). update it.
                    this._proxies[sId].updateSource(pfc);
                } else {
                    // set up new proxy
                    const leafProxy = new layerInterface.LayerInterface(null);
                    leafProxy.convertToPlaceholder(pfc);
                    this._proxies[sId] = leafProxy;
                }

                treeArray.push({ entryIndex: layerInfo.id });
            }
        };

        this._childTree = []; // public structure describing the tree

        // process the child layers our config is interested in, and all their children.
        if (this.config.layerEntries) {
            this.config.layerEntries.forEach(le => {
                if (!le.stateOnly) {
                    processLayerInfo(this._layer.layerInfos[le.index], this._childTree);
                }
            });
        }

        // trigger attribute load and set up children bundles.
        //      do we need an options object, with .skip set for sub-layers we are not dealing with?
        //      Alternate: add new option that is opposite of .skip.  Will be more of a
        //                 .only, and we won't have to derive a "skip" set from our inclusive
        //                 list
        //      Furthermore: skipping / being effecient might not really matter here anymore.
        //                   back in the day, loadLayerAttribs would actually load everything.
        //                   now it just sets up promises that dont trigger until someone asks for
        //                   the information. <-- for now we are doing this approach.
        const attributeBundle = this._apiRef.attribs.loadLayerAttribs(this._layer);

        // converts server layer type string to client layer type string
        const serverLayerTypeToClientLayerType = serverType => {
            switch (serverType) {
                case 'Feature Layer':
                    return shared.clientLayerType.ESRI_FEATURE;
                case 'Raster Layer':
                    return shared.clientLayerType.ESRI_RASTER;
                default:
                    console.warn('Unexpected layer type in serverLayerTypeToClientLayerType', serverType);
                    return shared.clientLayerType.UNKNOWN;
            }
        };

        // idx is a string
        attributeBundle.indexes.forEach(idx => {
            // if we don't have a defaulted sub-config, it means the attribute leaf is not present
            // in our visible tree structure.
            const subC = subConfigs[idx];
            if (subC && subC.defaulted) {
                // TODO need to worry about Raster Layers here.  DynamicFC is based off of
                //      attribute things.
                const dFC = new dynamicFC.DynamicFC(this, idx, attributeBundle[idx], subC.config);
                this._featClasses[idx] = dFC;

                // if we have a proxy watching this leaf, replace its placeholder with the real data
                const leafProxy = this._proxies[idx];
                if (leafProxy) {
                    leafProxy.convertToDynamicLeaf(dFC);
                }

                // load real symbols into our source
                dFC.loadSymbology();

                // update asynchronous values
                dFC.getLayerData().then(ld => {
                    dFC.layerType = serverLayerTypeToClientLayerType(ld.layerType);
                    if (dFC.layerType === shared.clientLayerType.ESRI_FEATURE) {
                        dFC.geomType = ld.geometryType;
                    }
                });

                this.getFeatureCount(idx).then(fc => {
                    dFC.featureCount = fc;
                });
            }
        });

        // TODO careful now, as the dynamicFC.DynamicFC constructor also appears to be setting visibility on the parent.
        if (this._configIsComplete) {
            // if we have a complete config, want to set layer visibility
            // get an array of leaf ids that are visible.
            // use _featClasses as it contains keys that exist on the server and are
            // potentially visible in the client.
            const initVis = Object.keys(this._featClasses)
                .filter(fcId => {return fetchSubConfig(fcId).config.state.visibility; })
                .map(fcId => { return parseInt(fcId); });

            if (initVis.length === 0) {
                initVis.push(-1); // esri code for set all to invisible
            }
            this._layer.setVisibleLayers(initVis);
        }

    }

    // override to add child index parameter
    zoomToScale (childIdx, map, lods, zoomIn, zoomGraphic = false) {
        // get scale set from child, then execute zoom
        return this._featClasses[childIdx].getScaleSet().then(scaleSet => {
            return this._zoomToScaleSet(map, lods, zoomIn, scaleSet, zoomGraphic);
        });
    }

    isOffScale (childIdx, mapScale) {
        return this._featClasses[childIdx].isOffScale(mapScale);
    }

    isQueryable (childIdx) {
        return this._featClasses[childIdx].queryable;
    }

    // TODO if we need this back, may need to implement as getChildGeomType.
    //      appears this ovverrides the LayerRecord.getGeomType function, which returns
    //      undefined, and that is what we want on the DynamicRecord level (as dynamic layer)
    //      has no geometry.
    //      Currently, all child requests for geometry go through the proxy,
    //      so could be this child-targeting version is irrelevant.
    /*
    getGeomType (childIdx) {
        // TEST STATUS none
        return this._featClasses[childIdx].geomType;
    }
    */

    getChildTree () {
        if (this._childTree) {
            return this._childTree;
        } else {
            throw new Error('Called getChildTree before layer is loaded');
        }
    }

    /**
     * Get the best user-friendly name of a field. Uses alias if alias is defined, else uses the system attribute name.
     *
     * @param {String} attribName     the attribute name we want a nice name for
     * @param {String}  childIndex    index of the child layer whos attributes we are looking at
     * @return {Promise}              resolves to the best available user friendly attribute name
     */
    aliasedFieldName (attribName, childIndex) {
        // TEST STATUS none
        return this._featClasses[childIndex].aliasedFieldName(attribName);
    }

    /**
     * Retrieves attributes from a layer for a specified feature index
     * @param {String}  childIndex  index of the child layer to get attributes for
     * @return {Promise}            promise resolving with formatted attributes to be consumed by the datagrid and esri feature identify
     */
    getFormattedAttributes (childIndex) {
        // TEST STATUS none
        return this._featClasses[childIndex].getFormattedAttributes();
    }

    /**
     * Check to see if the attribute in question is an esriFieldTypeDate type.
     *
     * @param {String} attribName     the attribute name we want to check if it's a date or not
     * @param {String}  childIndex    index of the child layer whos attributes we are looking at
     * @return {Promise}              resolves to true or false based on the attribName type being esriFieldTypeDate
     */
    checkDateType (attribName, childIndex) {
        // TEST STATUS none
        return this._featClasses[childIndex].checkDateType(attribName);
    }

    /**
    * Returns attribute data for a child layer.
    *
    * @function getAttribs
    * @param {String} childIndex  the index of the child layer
    * @returns {Promise}          resolves with a layer attribute data object
    */
    getAttribs (childIndex) {
        // TEST STATUS none
        return this._featClasses[childIndex].getAttribs();
    }

    /**
    * Returns layer-specific data for a child layer
    *
    * @function getLayerData
    * @param {String} childIndex  the index of the child layer
    * @returns {Promise}          resolves with a layer data object
    */
    getLayerData (childIndex) {
        return this._featClasses[childIndex].getLayerData();
    }

    getFeatureName (childIndex, objId, attribs) {
        return this._featClasses[childIndex].getFeatureName(objId, attribs);
    }

    getSymbology (childIndex) {
        return this._featClasses[childIndex].symbology;
    }

    /**
    * Run a query on a dynamic layer, return the result as a promise.
    * @function identify
    * @param {Object} opts additional argumets like map object, clickEvent, etc.
    * @returns {Object} an object with identify results array and identify promise resolving when identify is complete; if an empty object is returned, it will be skipped
    */
    identify (opts) {
        // TEST STATUS none
        // TODO caller must pass in layer ids to interrogate.  geoApi wont know what is toggled in the legend.
        //      param is opts.layerIds, array of integer for every leaf to interrogate.
        // TODO add full documentation for options parameter

        // bundles results from all leaf layers
        const identifyResults = [];

        // create an results object for every leaf layer we are inspecting
        opts.layerIds.forEach(leafIndex => {

            // TODO fix these params
            // TODO legendEntry.name, legendEntry.symbology appear to be fast links to populate the left side of the results
            //      view.  perhaps it should not be in this object anymore?
            // TODO see how the client is consuming the internal pointer to layerRecord.  this may also now be
            //      directly available via the legend object.
            const identifyResult =
                new shared.IdentifyResult('legendEntry.name', 'legendEntry.symbology', 'EsriFeature', this,
                    leafIndex, 'legendEntry.master.name'); // provide name of the master group as caption

            identifyResults[leafIndex] = identifyResult;
        });

        opts.tolerance = this.clickTolerance;

        const identifyPromise = this._apiRef.layer.serverLayerIdentify(this._layer, opts)
            .then(clickResults => {
                const hitIndexes = []; // sublayers that we got results for

                // transform attributes of click results into {name,data} objects
                // one object per identified feature
                //
                // each feature will have its attributes converted into a table
                // placeholder for now until we figure out how to signal the panel that
                // we want to make a nice table
                clickResults.forEach(ele => {
                    // NOTE: the identify service returns aliased field names, so no need to look them up here.
                    //       however, this means we need to un-alias the data when doing field lookups.
                    // NOTE: ele.layerId is what we would call featureIdx
                    hitIndexes.push(ele.layerId);

                    // get metadata about this sublayer
                    this.getLayerData(ele.layerId).then(lData => {
                        const identifyResult = identifyResults[ele.layerId];

                        if (lData.supportsFeatures) {
                            const unAliasAtt = attribFC.AttribFC.unAliasAttribs(ele.feature.attributes, lData.fields);

                            // TODO traditionally, we did not pass fields into attributesToDetails as data was
                            //      already aliased from the server. now, since we are extracting field type as
                            //      well, this means things like date formatting might not be applied to
                            //      identify results. examine the impact of providing the fields parameter
                            //      to data that is already aliased.
                            identifyResult.data.push({
                                name: ele.value,
                                data: this.attributesToDetails(ele.feature.attributes),
                                oid: unAliasAtt[lData.oidField],
                                symbology: [{
                                    svgcode: this._apiRef.symbology.getGraphicIcon(unAliasAtt, lData.renderer)
                                }]
                            });
                        }
                        identifyResult.isLoading = false;
                    });
                });

                // set the rest of the entries to loading false
                identifyResults.forEach(identifyResult => {
                    if (hitIndexes.indexOf(identifyResult.requester.featureIdx) === -1) {
                        identifyResult.isLoading = false;
                    }
                });

            });

        return {
            identifyResults: identifyResults.filter(identifyResult => identifyResult), // collapse sparse array
            identifyPromise
        };
    }

    // TODO docs
    getChildName (index) {
        // TEST STATUS none
        // TODO revisit logic. is this the best way to do this? what are the needs of the consuming code?
        // TODO restructure so WMS can use this too?
        // will not use FC classes, as we also need group names
        return this._layer.layerInfos[index].name;
    }

}

module.exports = () => ({
    DynamicRecord
});
