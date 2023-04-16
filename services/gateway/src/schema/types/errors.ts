import { Prisma } from '@prisma/client';
import { ZodError, ZodFormattedError } from 'zod';
import builder from '../builder';

function flattenErrors(
  error: ZodFormattedError<unknown>,
  path: string[],
): { path: string[]; message: string }[] {
  // eslint-disable-next-line no-underscore-dangle
  const errors = error._errors.map((message) => ({
    path,
    message,
  }));

  Object.keys(error).forEach((key) => {
    if (key !== '_errors') {
      errors.push(
        ...flattenErrors(
          (error as Record<string, unknown>)[key] as ZodFormattedError<unknown>,
          [...path, key],
        ),
      );
    }
  });

  return errors;
}

export class BadRequestError extends Error {}

const FieldValidationError = builder
  .objectRef<{
    message: string;
    path: string[];
  }>('ZodFieldError')
  .implement({
    fields: (t) => ({
      message: t.exposeString('message'),
      path: t.exposeStringList('path'),
    }),
  });

builder.objectType(ZodError, {
  name: 'ValidationError',
  fields: (t) => ({
    fieldErrors: t.field({
      type: [FieldValidationError],
      resolve: (err) => flattenErrors(err.format(), []),
    }),
  }),
});

const PrismaRuntimeError = builder
  .objectRef<{ message: string }>('PrismaRuntimeError')
  .implement({
    fields: (t) => ({
      message: t.exposeString('message'),
    }),
  });

builder.objectType(Prisma.PrismaClientKnownRequestError, {
  name: 'DataError',
  fields: (t) => ({
    error: t.field({
      type: PrismaRuntimeError,
      resolve: (err) => {
        // Unique constraint violation
        if (err.code === 'P2002') {
          return {
            message: 'There is already an account with that usrename or email.',
          };
        }

        // Other error
        throw err;
      },
    }),
  }),
});
