'use strict';

// Controls Interface class is used to provide something to the UI that it can bind to.
// It helps the UI keep in line with the layer state.
// Due to bindings, we cannot destroy & recreate an interface when a legend item
// goes from 'Unknown Placeholder' to 'Specific Layer Type'. This means we cannot
// do object heirarchies, as to go from PlaceholderInterface to FeatureLayerInterface
// would require a new object. Instead, we have a class that exposes all possible
// methods and properties as error throwing stubs. Then we replace those functions
// with real ones once we know the flavour of interface we want.

class LayerInterface {

    /**
     * @param {Object} source     object that provides info to the interface. usually a LayerRecord or FeatureClass
     */
    constructor (source) {
        this._source = source;

        // TODO revisit isPlaceholder after grand refactor
        this._isPlaceholder = true;
    }

    // shortcut function for throwing errors on unimplemented functions.
    _iAmError () {
        throw new Error('Call not supported.');
    }

    get isPlaceholder () { return this._isPlaceholder; } // returns Boolean

    // these expose ui controls available on the interface and indicate which ones are disabled
    get symbology () { this._iAmError(); } // returns Array

    // can be group or node name
    get name () { this._iAmError(); } // returns String

    // these are needed for the type flag
    get layerType () { this._iAmError(); } // returns String
    get geometryType () { this._iAmError(); } // returns String
    get featureCount () { this._iAmError(); } // returns Integer
    get extent () { this._iAmError(); } // returns Object (Esri Extent)

    // layer states
    get state () { this._iAmError(); } // returns String

    // these return the current values of the corresponding controls
    get visibility () { this._iAmError(); } // returns Boolean
    get opacity () { this._iAmError(); } // returns Decimal
    get query () { this._iAmError(); } // returns Boolean
    get snapshot () { this._iAmError(); } // returns Boolean

    // fetches attributes for use in the datatable
    get formattedAttributes () { this._iAmError(); } // returns Promise of Object

    // these set values to the corresponding controls
    setVisibility () { this._iAmError(); }
    setOpacity () { this._iAmError(); }
    setQuery () { this._iAmError(); }
    setSnapshot () { this._iAmError(); }

    zoomToBoundary () { this._iAmError(); } // returns promise that resolves after zoom completes

    // updates what this interface is pointing to, in terms of layer data source.
    // often, the interface starts with a placeholder to avoid errors and return
    // defaults. This update happens after a layer has loaded, and new now want
    // the interface reading off the real FC.
    // TODO docs
    updateSource (newSource) {
        this._source = newSource;
    }

    convertToSingleLayer (layerRecord) {
        this._source = layerRecord;
        this._isPlaceholder = false;

        newProp(this, 'symbology', standardGetSymbology);
        newProp(this, 'state', standardGetState);

        newProp(this, 'visibility', standardGetVisibility);
        newProp(this, 'opacity', standardGetOpacity);
        newProp(this, 'query', standardGetQuery);

        newProp(this, 'name', standardGetName);

        newProp(this, 'geometryType', standardGetGeometryType);
        newProp(this, 'layerType', standardGetLayerType);
        newProp(this, 'featureCount', standardGetFeatureCount);
        newProp(this, 'extent', standardGetExtent);

        this.setVisibility = standardSetVisibility;
        this.setOpacity = standardSetOpacity;
        this.setQuery = standardSetQuery;
        this.zoomToBoundary = standardZoomToBoundary;
    }

    convertToFeatureLayer (layerRecord) {
        this.convertToSingleLayer(layerRecord);

        newProp(this, 'snapshot', featureGetSnapshot);
        newProp(this, 'formattedAttributes', standardGetFormattedAttributes);
        newProp(this, 'geometryType', featureGetGeometryType);
        newProp(this, 'featureCount', featureGetFeatureCount);

        this.setSnapshot = featureSetSnapshot;
    }

    convertToDynamicLeaf (dynamicFC) {
        this._source = dynamicFC;
        this._isPlaceholder = false;

        newProp(this, 'symbology', dynamicLeafGetSymbology);
        newProp(this, 'state', dynamicLeafGetState);

        newProp(this, 'name', dynamicLeafGetName);

        newProp(this, 'visibility', dynamicLeafGetVisibility);
        newProp(this, 'opacity', dynamicLeafGetOpacity);
        newProp(this, 'query', dynamicLeafGetQuery);
        newProp(this, 'formattedAttributes', dynamicLeafGetFormattedAttributes);

        newProp(this, 'geometryType', dynamicLeafGetGeometryType);
        newProp(this, 'layerType', dynamicLeafGetLayerType);
        newProp(this, 'featureCount', dynamicLeafGetFeatureCount);
        newProp(this, 'extent', dynamicLeafGetExtent);

        this.setVisibility = dynamicLeafSetVisibility;
        this.setOpacity = dynamicLeafSetOpacity;
        this.setQuery = dynamicLeafSetQuery;
        this.zoomToBoundary = dynamicLeafZoomToBoundary;
    }

    convertToPlaceholder (placeholderFC) {
        this._source = placeholderFC;
        this._isPlaceholder = true;

        newProp(this, 'symbology', standardGetSymbology);
        newProp(this, 'name', standardGetName);
        newProp(this, 'state', standardGetState);
        newProp(this, 'layerType', standardGetLayerType);
    }

}

/**
 * Worker function to add or override a get property on an object
 *
 * @function newProp
 * @private
 * @param {Object} target     the object that will receive the new property
 * @param {String} propName   name of the get property
 * @param {Function} getter   the function defining the guts of the get property.
 */
function newProp(target, propName, getter) {
    Object.defineProperty(target, propName, {
        get: getter,
        enumerable: true,
        configurable: true
    });
}

// these functions are upgrades to the duds above.
// we don't use arrow notation, as we want the `this` to point at the object
// that these functions get smashed into.

function standardGetState() {
    /* jshint validthis: true */
    return this._source.state;
}

function dynamicLeafGetState() {
    /* jshint validthis: true */
    return this._source.state;
}

function standardGetVisibility() {
    /* jshint validthis: true */
    return this._source.visibility;
}

function dynamicLeafGetVisibility() {
    /* jshint validthis: true */
    return this._source.getVisibility();
}

function standardGetName() {
    /* jshint validthis: true */
    return this._source.name;
}

function dynamicLeafGetName() {
    /* jshint validthis: true */
    return this._source.name;
}

function standardGetOpacity() {
    /* jshint validthis: true */
    return this._source.opacity;
}

function dynamicLeafGetOpacity() {
    /* jshint validthis: true */
    return this._source.opacity;
}

function standardGetLayerType() {
    /* jshint validthis: true */
    return this._source.layerType;
}

function dynamicLeafGetLayerType() {
    /* jshint validthis: true */
    return this._source.layerType;
}

function standardGetExtent() {
    /* jshint validthis: true */
    return this._source.extent;
}

function dynamicLeafGetExtent() {
    /* jshint validthis: true */
    return this._source.extent;
}

function standardGetQuery() {
    /* jshint validthis: true */
    return this._source.isQueryable();
}

function dynamicLeafGetQuery() {
    /* jshint validthis: true */
    return this._source.queryable;
}

function standardGetFormattedAttributes() {
    /* jshint validthis: true */

    return this._source.getFormattedAttributes();
}

function dynamicLeafGetFormattedAttributes() {
    /* jshint validthis: true */

    // TODO code-wise this looks identical to standardGetFormattedAttributes.
    //      however in this case, ._source is a DynamicFC, not a LayerRecord.
    //      This is safer. Deleting this would avoid the duplication. Decide.
    return this._source.getFormattedAttributes();
}

function standardGetSymbology() {
    /* jshint validthis: true */
    return this._source.symbology;
}

function dynamicLeafGetSymbology() {
    /* jshint validthis: true */

    // TODO code-wise this looks identical to standardGetSymbology.
    //      however in this case, ._source is a DynamicFC, not a LayerRecord.
    //      This is safer. Deleting this would avoid the duplication. Decide.
    return this._source.symbology;
}

function standardGetGeometryType() {
    /* jshint validthis: true */
    return undefined;
}

function featureGetGeometryType() {
    /* jshint validthis: true */
    return this._source.getGeomType();
}

function dynamicLeafGetGeometryType() {
    /* jshint validthis: true */

    // TEST STATUS none
    return this._source.geomType;
}

function standardGetFeatureCount() {
    /* jshint validthis: true */
    return undefined;
}

function featureGetFeatureCount() {
    /* jshint validthis: true */
    return this._source.featureCount;
}

function dynamicLeafGetFeatureCount() {
    /* jshint validthis: true */
    return this._source.featureCount;
}

function standardSetVisibility(value) {
    /* jshint validthis: true */
    this._source.visibility = value;
}

function dynamicLeafSetVisibility(value) {
    /* jshint validthis: true */
    this._source.setVisibility(value);
}

function standardSetOpacity(value) {
    /* jshint validthis: true */
    this._source.opacity = value;
}

function dynamicLeafSetOpacity(value) {
    /* jshint validthis: true */
    this._source.opacity = value;
}

function standardSetQuery(value) {
    /* jshint validthis: true */
    this._source.setQueryable(value);
}

function dynamicLeafSetQuery(value) {
    /* jshint validthis: true */
    this._source.queryable = value;
}

function featureGetSnapshot() {
    /* jshint validthis: true */
    return this._source.isSnapshot;
}

function featureSetSnapshot() {
    // TODO trigger the snapshot process.  need the big picture on how this orchestrates.
    //      it involves a layer reload so possible this function is irrelevant, as the record
    //      will likely get nuked
    console.log('MOCKING THE SNAPSHOT PROCESS');
}

function standardZoomToBoundary(map) {
    /* jshint validthis: true */
    this._source.zoomToBoundary(map);
}

function dynamicLeafZoomToBoundary(map) {
    /* jshint validthis: true */
    this._source.zoomToBoundary(map);
}

module.exports = () => ({
    LayerInterface
});
