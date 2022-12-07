import {
  GraphQLDateTime,
  GraphQLUUID,
  GraphQLSafeInt,
  GraphQLJWT,
} from 'graphql-scalars';
import short from 'short-uuid';
import invariant from 'tiny-invariant';
import builder from './builder';

const translator = short();

export type Scalars = {
  DateTime: {
    Input: Date | string;
    Output: string;
  };
  Jwt: {
    Input: string;
    Output: string;
  };
  Uuid: {
    Input: string;
    Output: string;
  };
  ShortUuid: {
    Input: string;
    Output: string;
  };
  SafeInt: {
    Input: number;
    Output: number;
  };
};

builder.scalarType('ShortUuid', {
  serialize: (uuid) => translator.fromUUID(uuid),
  parseValue: (shortUuid) => {
    invariant(typeof shortUuid === 'string');
    return translator.toUUID(shortUuid);
  },
});

builder.addScalarType('DateTime', GraphQLDateTime, {});
builder.addScalarType('Jwt', GraphQLJWT, {});
builder.addScalarType('Uuid', GraphQLUUID, {});
builder.addScalarType('SafeInt', GraphQLSafeInt, {});
