import builder from '../builder';

export const ResizeParams = builder.inputType('ResizeParams', {
  fields: (it) => ({
    width: it.int({ required: true }),
    height: it.int({ required: true }),
  }),
});
