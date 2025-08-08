import { getFormData } from '@tanstack/react-form/start';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const getFormDataFromServer = createServerFn({ method: 'GET' }).handler(
  async () => {
    return getFormData();
  },
);

const clientEnv = z
  .object({ TURNSTILE_SITE_KEY: z.string() })
  .parse(process.env);

export const getClientEnv = createServerFn({
  method: 'GET',
  response: 'data',
}).handler(() => clientEnv);
