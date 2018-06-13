define([
    '../Core/Cartesian3',
    '../Core/Cartographic',
    '../Core/Check',
    '../Core/defined',
    '../Core/defineProperties',
    '../Core/destroyObject',
    '../Core/Event',
    '../Core/Iso8601',
    '../Core/Math',
    '../Scene/HeightReference',
    './Property'
], function(
    Cartesian3,
    Cartographic,
    Check,
    defined,
    defineProperties,
    destroyObject,
    Event,
    Iso8601,
    CesiumMath,
    HeightReference,
    Property) {
    'use strict';

    var scratchPosition = new Cartesian3();
    var scratchCarto = new Cartographic();

    /**
     * @private
     * @param {Scene} scene
     * @param {Property} height
     * @param {Property} extrudedHeight
     * @param {TerrainOffsetProperty~PositionFunction} getPosition
     * @constructor
     */
    function TerrainOffsetProperty(scene, height, extrudedHeight, getPosition) {
        //>>includeStart('debug', pragmas.debug);
        Check.defined('scene', scene);
        Check.defined('height', height);
        Check.defined('extrudedHeight', extrudedHeight);
        Check.typeOf.func('getPosition', getPosition);
        //>>includeEnd('debug');

        this._scene = scene;
        this._height = height;
        this._extrudedHeight = extrudedHeight;
        this._getPosition = getPosition;

        this._position = new Cartesian3();
        this._cartographicPosition = new Cartographic();
        this._normal = new Cartesian3();

        this._definitionChanged = new Event();
        this._terrainHeight = 0;
        this._removeCallbackFunc = undefined;

        var that = this;
        this._removeEventListener = scene.terrainProviderChanged.addEventListener(function() {
            that._updateClamping();
        });
        this._removeModeListener = scene.morphComplete.addEventListener(function() {
            that._updateClamping();
        });
    }

    defineProperties(TerrainOffsetProperty.prototype, {
        /**
         * Gets a value indicating if this property is constant.
         * @memberof TerrainOffsetProperty.prototype
         *
         * @type {Boolean}
         * @readonly
         */
        isConstant : {
            get : function() {
                return false;
            }
        },
        /**
         * Gets the event that is raised whenever the definition of this property changes.
         * @memberof TerrainOffsetProperty.prototype
         *
         * @type {Event}
         * @readonly
         */
        definitionChanged : {
            get : function() {
                return this._definitionChanged;
            }
        }
    });

    /**
     * @private
     */
    TerrainOffsetProperty.prototype._updateClamping = function() {
        var scene = this._scene;
        var globe = scene.globe;
        if (!defined(globe)) {
            this._terrainHeight = 0;
            return;
        }
        var ellipsoid = globe.ellipsoid;
        var surface = globe._surface;

        var position = this._position;
        if (defined(this._removeCallbackFunc)) {
            this._removeCallbackFunc();
        }

        var that = this;
        var cartographicPosition = ellipsoid.cartesianToCartographic(position, this._cartographicPosition);

        function updateFunction(clampedPosition) {
            var carto = ellipsoid.cartesianToCartographic(clampedPosition, scratchCarto);
            that._terrainHeight = carto.height;
            that.definitionChanged.raiseEvent();
        }
        this._removeCallbackFunc = surface.updateHeight(cartographicPosition, updateFunction);

        var height = globe.getHeight(cartographicPosition);
        if (defined(height)) {
            this._terrainHeight = height;
        } else {
            this._terrainHeight = 0;
        }
    };

    /**
     * Gets the height relative to the terrain based on the positions.
     *
     * @returns {Cartesian3} The offset
     */
    TerrainOffsetProperty.prototype.getValue = function(time, result) {
        var heightProperty = this._height;
        var extrudedHeightProperty = this._extrudedHeight;
        var heightReference = HeightReference.NONE;
        var extrudedHeightReference = HeightReference.NONE;
        if (defined(heightProperty)) {
            heightReference = Property.getValueOrDefault(heightProperty.heightReference, time, HeightReference.NONE);
        }
        if (defined(extrudedHeightProperty)) {
            extrudedHeightReference = Property.getValueOrDefault(extrudedHeightProperty.heightReference, time, HeightReference.NONE);
        }

        if (heightReference === HeightReference.NONE && extrudedHeightReference !== HeightReference.RELATIVE_TO_GROUND) {
            return Cartesian3.clone(Cartesian3.ZERO, result);
        }

        var position = this._getPosition(time, scratchPosition);
        if (!defined(position) || Cartesian3.equals(position, Cartesian3.ZERO)) {
            return Cartesian3.clone(Cartesian3.ZERO, result);
        }

        if (Cartesian3.equalsEpsilon(this._position, position, CesiumMath.EPSILON10)) {
            return Cartesian3.multiplyByScalar(this._normal, this._terrainHeight, result);
        }

        this._position = Cartesian3.clone(position, this._position);

        this._updateClamping();

        var normal = this._scene.globe.ellipsoid.geodeticSurfaceNormal(position, this._normal);
        return Cartesian3.multiplyByScalar(normal, this._terrainHeight, result);
    };

    /**
     * Compares this property to the provided property and returns
     * <code>true</code> if they are equal, <code>false</code> otherwise.
     *
     * @param {Property} [other] The other property.
     * @returns {Boolean} <code>true</code> if left and right are equal, <code>false</code> otherwise.
     */
    TerrainOffsetProperty.prototype.equals = function(other) {
        return this === other ||//
               (other instanceof TerrainOffsetProperty &&
                this._scene === other._scene &&
                Property.equals(this._position, other._position));
    };

    TerrainOffsetProperty.prototype.isDestroyed = function() {
        return false;
    };

    TerrainOffsetProperty.prototype.destroy = function() {
        this._removeEventListener();
        this._removeModeListener();
        if (defined(this._removeCallbackFunc)) {
            this._removeCallbackFunc();
        }
        return destroyObject(this);
    };

    /**
     * A function which creates one or more providers.
     * @callback TerrainOffsetProperty~PositionFunction
     * @param {JulianDate} time The clock time at which to retrieve the position
     * @param {Cartesian3} result The result position
     * @returns {Cartesian3} The position at which to do the terrain height check
     */

    return TerrainOffsetProperty;
});
