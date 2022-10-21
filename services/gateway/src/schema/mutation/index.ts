import builder from '../builder';

builder.mutationType();

builder.mutationField('hello', (t) => t.string({ resolve: () => 'world' }));
