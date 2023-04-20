import envariant from '@knpwrs/envariant';
import server$ from 'solid-start/server';
import invariant from 'tiny-invariant';

const SECRET_KEY = envariant('TURNSTILE_SECRET_KEY', server$.env);

export default async function validateTurnstile(form: FormData) {
  const token = form.get('cf-turnstile-response');
  invariant(token, 'Turnstile token is missing');

  const formData = new FormData();
  formData.append('secret', SECRET_KEY);
  formData.append('response', token);

  const result = await fetch(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      body: formData,
      method: 'POST',
    },
  );

  const json = await result.json();

  if (!json.success) {
    throw new Error('Turnstile validation failed');
  }

  return true;
}
