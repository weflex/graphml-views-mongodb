"use strict";

const _ = require('lodash');
const fs = require('fs');
const moment = require('moment');
const graphml = require('graphml-parser');
const glob = require('glob').sync;
const path = require('path');
const ObjectID = require('mongodb').ObjectID;

class MongoView {
  constructor(name, source, options) {
    const ast = graphml.parse(source);
    this.models = options.models;
    this.dataSources = options.dataSources;
    this.name = name;
    this.rootType = ast.type;
    this.keys = [
      {
        type: this.rootType,
        idKey: (id) => {
          return {
            _id: ObjectID(id)
          };
        }
      }
    ];
    this.rootTree = this.parseTreeWithModels(ast.root);
  }
  parseTreeWithModels(ast) {
    let type = ast.type;
    if (!type) {
      type = ast.type = this.rootType;
      ast.isRoot = true;
    }
    let model = this.models[type];
    if (!model) {
      return;
      throw new Error(
        'occuring an error when parsing the model `' + type + '`.');
    }
    let relations = model.relations;
    for (let name in ast.methods) {
      let method = ast.methods[name];
      let relation = relations[name];
      if (method.args && method.args.$relation) {
        relation = relations[method.args.$relation];
      }
      if (!relation) {
        throw new TypeError('cannot handle with method: ' + name);
      }
      method.name = name;
      method.type = relation.model;
      method.relation = relation;
      if (ast.isRoot && method.relation.type === 'hasMany') {
        method.filterConfig = {
          name: method.name,
          base: {
            [method.name]: {
              $elemMatch: null
            }
          },
          hasArray: true,
          isHasMany: true
        };
      } else {
        let parentConfig = method.parent.filterConfig;
        let currentConfig = {
          name: method.name
        };
        if (!parentConfig) {
          currentConfig.base = currentConfig.name;
        } else {
          if (parentConfig.hasArray === true) {
            currentConfig.hasArray = true;
            if (parentConfig.isHasMany) {
              currentConfig.superBase = parentConfig;
              currentConfig.base = currentConfig.name;
            } else {
              currentConfig.superBase = parentConfig.superBase;
              currentConfig.base = parentConfig.base + '.' + currentConfig.name;
            }
          } else {
            currentConfig.base = parentConfig.base + '.' + currentConfig.name;
          }
        }
        method.filterConfig = currentConfig;
      }
      this.keys.push({
        type: relation.model,
        idKey: (id) => {
          let config = method.filterConfig;
          id = ObjectID(id);
          if (!config) {
            return {_id: id};
          } else if (config.hasArray === true) {
            let filter;
            if (config.superBase) {
              filter = Object.assign({}, config.superBase.base);
              filter[config.superBase.name].$elemMatch = {
                [config.base + '._id']: id
              };
            } else {
              filter = Object.assign({}, config.base);
              filter[config.name].$elemMatch = {
                _id: id
              };
            }
            return filter;
          } else {
            return {[config.base + '._id']: id};
          }
        }
      });
      this.parseTreeWithModels(method);
    }
    return ast;
  }
  fetchAll() {
    return this.fetchItemOrItems(this.rootTree)
    .then((results) => {
      return this.uploadToViewsDb(results);
    });
  }
  fetch(where) {
    let coll = this.dataSources.view.collection(this.name);
    return coll.find(where).toArray().then((items) => {
      return items.map((item) => ObjectID(item._id));
    }).then((ids) => {
      if (ids.length > 0) {
        return this.fetchItemOrItems(this.rootTree, ids);
      } else {
        return [];
      }
    }).then((results) => {
      if (results.length > 0) {
        return this.updateToViewsDb(results);
      }
    })
  }
  fetchItemOrItems(config, id) {
    let coll = this.dataSources.rest.collection(config.type);
    let cursor = coll.find();
    let filter = {};
    if (id) {
      if (Array.isArray(id)) {
        filter = {
          _id: {$in: id}
        };
      } else if (id.isPlainObject) {
        delete id.isPlainObject;
        filter = Object.assign({}, id);
      } else {
        let newId;
        try {
          newId = ObjectID(id);
        } catch (err) {
          newId = id;
        }
        filter = {
          _id: newId,
        };
      }
    }

    const queryArgs = Object.assign({}, config.args);
    if (queryArgs) {
      delete queryArgs.$relation;
      if (typeof queryArgs.$limit === 'number') {
        cursor = cursor.limit(queryArgs.$limit);
        delete queryArgs.$limit;
      }
      if (typeof queryArgs.$orderBy === 'string') {
        cursor = cursor.sort({
          [queryArgs.$orderBy]: 1
        });
        delete queryArgs.$orderBy;
      }
      if (typeof queryArgs.$lastWeekBy === 'string') {
        queryArgs[queryArgs.$lastWeekBy] = {
          $gt: moment().startOf('isoWeek').toDate(),
          $lt: moment().endOf('isoWeek').toDate()
        };
        delete queryArgs.$lastWeekBy;
      }
      if (Object.keys(queryArgs).length > 0) {
        filter = Object.assign(filter, queryArgs);
      }
    }
    return cursor.filter(filter).toArray().then((items) => {
      let filteredResults = items.map(item => {
        return config.fields.concat('_id').reduce((newItem, field) => {
          newItem[field] = item[field];
          if (field === '_id') {
            newItem.id = item._id;
          }
          return newItem;
        }, {
          _raw: item
        });
      }).map(item => {
        // copy item._raw into the variable `rawItem` for later usage
        let rawItem = Object.assign({}, item._raw);
        // delete the original _raw field
        delete item._raw;

        // start define the monads/promises
        let tasks = Object.keys(config.methods).map((methodName) => {
          let method = config.methods[methodName];
          let foreignKey;
          try {
            foreignKey = method.relation.foreignKey;
            if (!foreignKey) {
              throw new TypeError('unknown foreignKey');
            }
          } catch (err) {
            console.error(method, err);
          }
          let $promise;
          switch (method.relation.type) {
            case 'belongsTo':
              let foreignId = rawItem[foreignKey];
              if (foreignId === undefined) {
                return null;
              }
              $promise = this.fetchItemOrItems(method, foreignId)
              .then((data) => {
                return {
                  data: data[0],
                  name: method.name
                };
              });
              break;
            case 'hasMany':
              $promise = this.fetchItemOrItems(method, {
                // in hasMany mode, taking the id of this mode, and put the following
                // { [foreignKey]: id }
                [foreignKey]: rawItem._id,
                isPlainObject: true
              })
              .then((data) => {
                return {
                  data: data,
                  name: method.name
                }
              });
              break;
            case 'referencesMany':
              $promise = this.fetchItemOrItems(method, rawItem.roleIds)
              .then((data) => {
                return {
                  data: data,
                  name: method.name,
                };
              });
              break;
            default:
              $promise = null;
          }
          return $promise;
        }).filter((item) => {
          return item !== null;
        });
        if (tasks.length === 0) {
          return item;
        } else {
          return Promise.all(tasks).then((results) => {
            for (let result of results) {
              item[result.name] = result.data;
            }
            return item;
          });
        }
      });
      return Promise.all(filteredResults);
    });
  }
  uploadToViewsDb(results) {
    let coll = this.dataSources.view.collection(this.name);
    return coll.deleteMany({
      _id: {$in: _.map(results, '_id')}
    }).then(() => {
      if (results.length > 0) {
        return coll.insertMany(results);
      } else {
        return results;
      }
    });
  }
  updateToViewsDb(results) {
    let coll = this.dataSources.view.collection(this.name);
    let upsertTasks = results.map((data) => {
      return coll.update({_id: data.id}, data);
    });
    return Promise.all(upsertTasks);
  }
}

function parseGraphs (models, dataSources, dir) {
  const graphPath = path.join(dir, './specs');
  return glob(graphPath + '/*.graphml').map((p) => {
    const name = path.basename(p, '.graphml');
    const source = fs.readFileSync(p).toString('utf8');
    return new MongoView(name, source, {
      dataSources: dataSources,
      models: models
    });
  });
}

exports.MongoView = MongoView;
exports.parseGraphs = parseGraphs;
