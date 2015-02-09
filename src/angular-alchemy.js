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
        // Track the name of all the models defined,
        // their attributes, and the default values
        // ----------------------------------------------------------
        var namedModels = {};

        // Helper function to return a copy of the model defintion
        // The "Model Definition" is the "template" for a new object.
        // The template is defined during the App.Config phase:
        // ----------------------------------------------------------
        // eg:
        // AngularAlchemy.registerModel('User', {
        //      firstName: '',
        //      lastName: '',
        //      email: ''
        // });
        //
        // namedModels['User'] would contain the object passed
        // into "registerModel"

        var getModelDefinition = function(name) {
            if (namedModels[name]) {
                return angular.copy(namedModels[name]);
            }
            return null;
        };

        // ----------------------------------------------------------
        // Route Configurations, Serialize/Deserialize methods etc
        // for each model will be held here
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

            // We iterate through each attribute in our model definition
            // and find the corresponding values from the data.
            // Once found, we map it back to our deserialized object
            for (key in obj) {
                if (Object.prototype.hasOwnProperty.call(obj, key) &&
                   (typeof obj[key] !== 'function')) {
                    if (data[key]) deserialized[key] = data[key];
                }
            }
            return deserialized;
        }

        // Default Deserialize Methods for Collections
        // ----------------------------------------------------------
        // Params:
        //     data -  response data from the server
        //     modelName - used to retrieve the modal definition
        // ----------------------------------------------------------
        // We loop through each object in the data array, then run
        // "fromServer" on each object to deserialize.

        var collectionFromServer = function(data, modelName) {
            var toDeserialize = null;
            var mname = modelName.toLowerCase();

            // Check to see if the data returned to us is already an array
            if (data instanceof Array) {
                toDeserialize = data;
            // If it's not, we try to find a key in the data that match
            // the model we are trying to deserialize
            // ----------------------------------------------------------
            // Note: the "+s" is a simple way to check for pluralized keys
            // eg: the "User" model key for a collection could be "users"
            } else {
                toDeserialize = data[modelName] || data[mname] || data[mname +'s'];
            }

            // Return an array of deserialized data
            if (toDeserialize && toDeserialize instanceof Array) {
                return toDeserialize.map(function(modelData) {
                    return fromServer(modelData, modelName);
                });
            }
            return null;
        }

        // Default Serialize Methods for Models
        // ----------------------------------------------------------
        // Return:
        //     - The serialized data payload to be sent to the server
        // ----------------------------------------------------------
        // Note: "this" will refer to the model instance hence we're
        // checking for "this[key]"

        var toServer = function(modelName) {
            var modelDefinition = getModelDefinition(modelName);
            var key, serialized = {};
            for (key in modelDefinition) {
                if (Object.prototype.hasOwnProperty.call(modelDefinition, key) &&
                   (key in this) &&
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

        // ----------------------------------------------------------
        // Register / Configure our Models during App.Config
        // ----------------------------------------------------------
        // These methods are exposed in AngularAlchemyProvider
        // ----------------------------------------------------------

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

            // Check model definition to see if we have an id field defined.
            // If not, we use the default 'id' field
            if (!namedModels[modelName][aggregateConfig.idField]) {
                namedModels[modelName][aggregateConfig.idField] = '';
            }
        };

        // ----------------------------------------------------------
        // Attach CRUD methods to our model object.
        // Behavior varies depending on the type of objct.
        // ----------------------------------------------------------
        // eg:
        // If it is a new object, the "save" method will submit a POST.
        // If it is an existing object, the "save" method will PUT.
        // ----------------------------------------------------------

        var attachCRUDMethods = function (obj, modelName) {
            var modelConfig = modelConfigs[modelName];
            obj.save = function(config) {
                var url,
                    method,
                    data = modelConfig.toServer.call(obj, modelName),
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
        // Model:
        // This method will be the main way to configure a request for
        // data.
        //
        // Params:
        //    - modelName: the name of the model you want to look up
        //    - params: QueryString
        //    - isCollection: We trying to get a list or an individual
        //      resource?
        // ----------------------------------------------------------
        //  returns: {
        //      get: function() {} // Promise
        //  }
        // ----------------------------------------------------------

        var Model = function(modelName, params, isCollection) {
            var url;

            // Make sure we can actually find the model
            var config = modelConfigs[modelName];
            if (!config) throw 'Cannot load the Model "' + modelName + '".';

            params = params || {};
            // Is the user trying to access a single resource or
            // a collection?
            if (isCollection) {
                url = interpolateUrl(config.collectionUrl, params)
            } else {
                url = interpolateUrl(config.retrieveUrl, params);
            }

            return {
                get: function(query) {
                    var deferred = $q.defer();
                    $http.get(url, query)
                    .then(function(resp) {
                        var data;
                        if (isCollection) {
                            data = config.collectionFromServer(resp.data, modelName);
                            if (data) {
                                deferred.resolve(
                                    data.map(function(item) {
                                        return attachCRUDMethods(item, modelName);
                                    })
                                );
                            } else {
                                deferred.reject('Could not deserialize collection data from ' + url);
                            }
                        } else {
                            data = config.fromServer(resp.data, modelName);
                            if (data) {
                                deferred.resolve(attachCRUDMethods(data));
                            } else {
                                deferred.reject('Could not deserialize data from ' + url);
                            }
                        }
                    }, function(reason) {
                        deferred.reject(reason);
                    });
                    return deferred.promise;
                };
            };
        }

        // ----------------------------------------------------------
        // APP Configure API
        // ----------------------------------------------------------
        this.setUrlPrefix = function(prefix) {
            if (! _containsTrailingSlash(prefix)) prefix += '/';
            urlPrefix = prefix;
        };

        this.registerModel = registerModel;
        this.configureModel = registerConfig;


        this.$get = ['$http', '$q', 'AATransformers', function(_http, _q, Transformers) {
            $http = _http;
            $q = _q;
            return {
                Model: Model,
                Transformers: Transformers
            };
        }];
    });

    // ----------------------------------------------------------
    // Transforms -
    // Used to transform the data returned to/from the server
    // before serialization/deserialization occurs.
    //
    // Similar to the "Adapter" idea in ember data
    // ----------------------------------------------------------
    // Built In Transformers -
    //   - Snake to Camel
    //   - Camel to Snake
    // ----------------------------------------------------------
    module.factory('AATransformers', [function() {

        var camelToSnakeTransform = function(str) {
            return str.replace(/([a-z])([A-Z])/g, '\1_\2').toLowerCase();
        };

        var snakeToCamelTransform = function(str) {
            return str.replace(/(\w)_(\w)/g, function(match, p1, p2) {
                return p1 + p2.charAt(0).toUpperCase() + p2.substr(1);
            });
        };


        var transformData = function(data, transformer) {
            var queue = [data];
            while (queue.length > 0) {
                var item = queue.pop(),
                    i,
                    len,
                    keys = [],
                    key,
                    transformed;

                // For array types
                if (item instanceof Array) {
                    for(i = 0, len = item.length; i < len; i++) {
                        // Find all objects and other arrays to push
                        // into the queue to be checked
                        if (item[i] !== null && (typeof item[i] === 'object')) {
                            queue.push(item[i]);
                        }
                    }

                // For Objects
                } else {

                    // We want to track the keys in the original object
                    // so we only work on the original keys and
                    // not the newly created ones (due to the transform)
                    //
                    for (key in item) {
                        if (Object.prototype.hasOwnProperty.call(item, key)) {
                            keys.push(key);
                        }
                    }

                    for (i = 0, len = keys.length; i < len; i++) {
                        key = keys[i];
                        transformed = transformer(key);
                        item[transformed] = item[key];
                        // Add other objects / arrays into the queue
                        if (item[key] !== null && (typeof item[key] ==='object')) {
                            queue.push(item[key]);
                        }
                        // Remove the old key
                        delete item[key];
                    }
                }
            }
            return data;
        }

        return {
            SnakeToCamel: function(data) {
                return transformData(data, snakeToCamelTransform);
            },

            CamelToSnake: function(data) {
                return transformData(data, camelToSnakeTransform);
            }
        };
    }]);

})(angular);
