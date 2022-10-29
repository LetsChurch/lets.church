import { GraphQLDateTime, GraphQLUUID } from 'graphql-scalars';
import short from 'short-uuid';
import invariant from 'tiny-invariant';
import builder from './builder';

const translator = short();

builder.scalarType('ShortUuid', {
  serialize: (uuid) => translator.fromUUID(uuid),
  parseValue: (shortUuid) => {
    invariant(typeof shortUuid === 'string');
    return translator.toUUID(shortUuid);
  },
});

builder.addScalarType('DateTime', GraphQLDateTime, {});
builder.addScalarType('Uuid', GraphQLUUID, {});
