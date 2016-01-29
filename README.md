# Graphml-views-mongodb

[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Dependency Status][david-image]][david-url]
[![Downloads][downloads-image]][downloads-url]

A library that enable views for MongoDB based on [GraphML], which generates collections 
from MongoDB datasources by given graphml files.

## Installation

```sh
$ npm install graphml-views-mongodb --save
```

## Why create this?

The original MongoDB doesn't support view like CouchDB and other SQL-Like database. And
it supports the following ways to make relations between multiple collections:

- embed documents
- `DBRef` type to reference to other database

### weakness of the above ways to relate collections

The embed documents even though has a avilability for retrieving data, but lack of consistency
on writing data on the embeded documents.

The `DBRef` is not recommended way to take the role of expressing relations, we should use it
to reference a value to another database that maybe in other system.

### about loopback.io

The next context is about [Loopback], the framework to replace the role of Parse and LeanCloud,
the framework abstracts most popluar databases into the same one schema, and it support rich relations
as below:

- one-to-one
- one-to-many

That's good, but not enough, because [Loopback]'s scoping/joining syntax is such complicated so that
the request URLs would become too long and unreadability. So sometimes, the truth is that we want a collection
is for a view, and we just query it directly from the collection without scoping and joining. At the same time,
for write operations, we hope that model-based would be used and it will updates data to the view collections.

### why GraphML?

In starting this project, we tried JSON, YAML and TOML to express what fields would be in our view collection,
but they are almost out after having a try on GraphQL, and then we found GraphQL is the QL for querying, so we,
the [WeFlex] team decoded to rewrite a new marked language based on basic of [GraphQL], that's the [GraphML].

To express a view, you just need the following:

```
User {
  username,
  nickname,
  sex,
  country,
  orgs {
    name
  },
  followings {
    username,
    avatarUrl
  },
  followers {
    username,
    avatarUrl
  }
}
```

Then you will get document:

```JSON
{
  "_id": "id",
  "username": "yorkie",
  "nickname": "yorkie",
  "sex": "female",
  "country": "internet",
  "orgs": [
    {
      "_id": "weflex_id",
      "name": "weflex"
    }
  ],
  "followings": [
    {
      "_id": "following_id",
      "name": "substack",
      "avatarUrl": "image url"
    }
  ],
  "followers": [
    {
      "_id": "follower_id",
      "name": "scott",
      "avatarUrl": "image url"
    }
  ]
}
```

### How it works

The [Graphml-views-mongodb] does parse a GraphML file and get fields collection that you want to include from
the source collections, and read the relations from pre-defined [Loopback] models, and generate the complete
documents.

## API

- `parseGraphs(models, dataSources)`
  - `models` {Array} the object returned from loopback
  - `dataSources` {Object} the object to take dataSources
    - `rest` {MongoDB} the resouce database instance
    - `view` {MongoDB} the view database instance

## License

MIT @ WeFlex, Inc.

[Graphml-views-mongodb]: https://github.com/weflex/graphml-views-mongodb
[GraphQL]: https://github.com/facebook/graphql
[GraphML]: https://github.com/weflex/graphml
[Loopback]: https://github.com/strongloop/loopback
[WeFlex]: https://github.com/weflex

[npm-image]: https://img.shields.io/npm/v/graphml-views-mongodb.svg?style=flat-square
[npm-url]: https://npmjs.org/package/graphml-views-mongodb
[travis-image]: https://img.shields.io/travis/weflex/graphml-views-mongodb.svg?style=flat-square
[travis-url]: https://travis-ci.org/weflex/graphml-views-mongodb
[david-image]: http://img.shields.io/david/weflex/graphml-views-mongodb.svg?style=flat-square
[david-url]: https://david-dm.org/weflex/graphml-views-mongodb
[downloads-image]: http://img.shields.io/npm/dm/graphml-views-mongodb.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/graphml-views-mongodb

