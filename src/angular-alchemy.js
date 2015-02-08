(function(angular) {
    var module = angular.module('angular-alchemy', []);
    module.provider('AngularAlchemy', function() {
        var provider = this;
        var $http, $q;
        var _containsTrailingSlash = function(str) {
            return str.charAt(str.length - 1) === '/';
        };

        // ----------------------------------------------------------
        // Alow URL Prefixes (Versioned APIs etc)
        // ----------------------------------------------------------
        var urlPrefix = "/"

        // ----------------------------------------------------------
        // Track the name of all the models we're registering
        // and their attributes / default values
        // ----------------------------------------------------------
        var namedModels = {};

        var getModelDefinition = function(name) {
            if (namedModels[name]) {
                return angular.copy(namedModels[name]);
            }
            return null;
        };

        // ----------------------------------------------------------
        // Default model configurations and methods
        // ----------------------------------------------------------
        var modelConfigs = {};


        // Default Deserialize Methods for Models
        // ----------------------------------------------------------
        // Params:
        //     data -  response data from the server
        //     modelName - used to retrieve the modal definition

        var fromServer = function(data, modelName) {
            var key,
                deserialized = {};
                obj = getModelDefinition(modelName);

            for (key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key) &&
                   (typeof obj[key] !== 'function')) {
                    if (data[key]) deserialized[key] = data[key];
                }
            }
            return deserialized;
        }

        var collectionFromServer = function(data, modelName) {
            if (data instanceof Array) {
                return data.map(function(modelData) {
                    return attachCRUDMethods(
                        modelName,
                        fromServer(modelData, modelName)
                    );
                });
            }
            return null;
        }

        // Default Serialize Methods for Models
        // ----------------------------------------------------------
        // Return:
        //     - The serialized data payload to be sent to the server

        var toServer = function() {
            var key, serialized = {};
            for (key in this) {
                if (Object.prototype.hasOwnProperty.call(this, key) &&
                   typeof this[key] !== 'function') {
                    serialized[key] = this[key];
                }
            }
            return serialized;
        };


        // ----------------------------------------------------------
        // Substitutes model property values
        // into placeholders in a URL
        // ----------------------------------------------------------
        // Eg: str = http://{ url }.com
        // interpolateUrl(str, {url: 'google'}) => http://google.com

        var interpolateUrl = function(url, obj) {
            return url.replace(/{(\s*[^{}]*\s*)}/g, function(match, attr) {
                var val = obj[attr.trim()];
                if ( (typeof val === 'string') || (typeof val === 'number') ) {
                    return val;
                } else {
                    return match;
                }
            });
        };

        var registerModel = function(modelName, modelDefaults, config) {
            namedModels[modelName] = modelDefaults;
            config = config || {};
            registerConfig(modelName, config);
        };

        var registerConfig = function(modelName, config) {
            var mname = modelName.toLowerCase(),
                defaultBaseUrl = config.urlPrefix ||
                    urlPrefix + modelName.toLowerCase() + 's/';

            if (!_containsTrailingSlash(defaultBaseUrl)) defaultBaseUrl += '/';

            var baseConfig = {
                idField: 'id',
                collectionUrl: defaultBaseUrl,
                createUrl: defaultBaseUrl,
                retrieveUrl: defaultBaseUrl + '{id}',
                updateUrl: defaultBaseUrl + '{id}',
                deleteUrl: defaultBaseUrl + '{id}',
                toServer: toServer,
                fromServer: fromServer,
                collectionFromServer: collectionFromServer
            };

            var aggregateConfig = {};
            angular.extend(aggregateConfig, baseConfig);
            angular.extend(aggregateConfig, config);
            modelConfigs[modelName] = aggregateConfig;
        };

        var attachCRUDMethods = function (modelName, obj) {
            var modelConfig = modelConfigs[modelName];
            obj.save = function(config) {
                var url,
                    method,
                    data = modelConfig.toServer.call(obj),
                    config = config || {},
                    deferred = $q.defer();

                // An "id" exists on the object therefore the save
                // will be an update
                if (obj[modelConfig.idField]) {
                    url = interpolateUrl(modelConfig.updateUrl, obj);
                    method = $http.put;
                } else {
                    url = interpolateUrl(modelConfig.createUrl, obj);
                    method = $http.post;
                }


                // Post to the endpoint
                method(url, data, config)
                .then(function(resp) {
                    // Refresh object properties with new data from server
                    var deserialized = modelConfig
                        .fromServer(resp.data, modelName);

                    angular.extend(obj, deserialized);
                    deferred.resolve(resp);
                }, function(reason) {
                    deferred.reject(reason);
                });

                return deferred.promise;
            };

            // We also want to attach a delete method
            // if the object contains an "id"
            if (obj[modelConfig.idField]) {
                obj.delete = function(config) {
                    var url = interpolateUrl(modelConfig.deleteUrl, obj),
                        config = config || {}
                        deferred = $q.defer();

                    $http.delete(url, config)
                    .then(function(resp) {
                        obj = null;
                        deferred.resolve(resp);
                    }, function(reason) {
                        deferred.reject(reason);
                    });
                    return deferred.promise;
                }
            }
            return obj;
        };

        // ----------------------------------------------------------
        // APP Configure API
        // ----------------------------------------------------------
        this.setUrlPrefix = function(prefix) {
            if (! _containsTrailingSlash(prefix)) prefix += '/';
            urlPrefix = prefix;
        };

        this.registerModel = registerModel;
        this.configureModel = registerConfig;


        this.$get = ['$http', '$q', function(_http, _q) {
            $http = _http;
            $q = _q;
            return {
            };
        }];
    });

})(angular);
