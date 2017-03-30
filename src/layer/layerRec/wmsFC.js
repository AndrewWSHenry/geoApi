'use strict';

const basicFC = require('./basicFC.js')();

/**
 * Searches for a layer title defined by a wms.
 * @function getWMSLayerTitle
 * @private
 * @param  {Object} wmsLayer     esri layer object for the wms
 * @param  {String} wmsLayerId   layers id as defined in the wms (i.e. not wmsLayer.id)
 * @return {String}              layer title as defined on the service, '' if no title defined
 */
function getWMSLayerTitle(wmsLayer, wmsLayerId) {
    // TEST STATUS none
    // TODO move this to ogc.js module?

    // crawl esri layerInfos (which is a nested structure),
    // returns sublayer that has matching id or null if not found.
    // written as function to allow recursion
    const crawlSubLayers = (subLayerInfos, wmsLayerId) => {
        let targetEntry = null;

        // we use .some to allow the search to stop when we find something
        subLayerInfos.some(layerInfo => {
            // wms ids are stored in .name
            if (layerInfo.name === wmsLayerId) {
                // found it. save it and exit the search
                targetEntry = layerInfo;
                return true;
            } else if (layerInfo.subLayers) {
                // search children. if in children, will exit search, else will continue
                return crawlSubLayers(layerInfo.subLayers, wmsLayerId);
            } else {
                // continue search
                return false;
            }
        });

        return targetEntry;
    };

    // init search on root layerInfos, then process result
    const match = crawlSubLayers(wmsLayer.layerInfos, wmsLayerId);
    if (match && match.title) {
        return match.title;
    } else {
        return ''; // falsy!
    }
}

/**
 * @class WmsFC
 */
class WmsFC extends basicFC.BasicFC {

    // this will actively download / refresh the internal symbology
    loadSymbology () {
        const configLayerEntries =  this._parent.config.layerEntries;
        const gApi = this._parent._apiRef;
        const legendArray = gApi.layer.ogc
            .getLegendUrls(this._parent._layer, configLayerEntries.map(le => le.id))
            .map((imageUri, idx) => {

                const symbologyItem = {
                    name: null,
                    svgcode: null
                };

                // config specified name || server specified name || config id
                const name = configLayerEntries[idx].name ||
                    getWMSLayerTitle(this._parent._layer, configLayerEntries[idx].id) ||
                    configLayerEntries[idx].id;

                gApi.symbology.generateWMSSymbology(name, imageUri).then(data => {
                    symbologyItem.name = data.name;
                    symbologyItem.svgcode = data.svgcode;
                });

                return symbologyItem;
            });
        this.symbology = legendArray;
    }
}

module.exports = () => ({
    WmsFC
});
