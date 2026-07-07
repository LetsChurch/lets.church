import { useCallback, useRef } from 'react';

import { slugify } from '@/util/slugify';

/**
 * Keep a slug field in sync with a name field while the user is creating an
 * entity: as they type the name we suggest `slugify(name)`, but once they edit
 * the slug themselves we stop overwriting it. This gives every creation flow
 * (channels, churches, …) the same behavior — an auto-filled slug the user can
 * still change.
 *
 * Usage with TanStack Form field listeners:
 *
 *   const autoSlug = useAutoSlug();
 *   <form.AppField name="name" listeners={{ onChange: ({ value }) => {
 *     const next = autoSlug.onNameChange(value);
 *     if (next !== null) form.setFieldValue('slug', next);
 *   }}}>…</form.AppField>
 *   <form.AppField name="slug" listeners={{
 *     onChange: ({ value }) => autoSlug.onSlugChange(value),
 *   }}>…</form.AppField>
 *
 * Programmatic `setFieldValue('slug', …)` triggers the slug listener too, so we
 * record the value we auto-filled and only flip to "edited" when the slug
 * diverges from it — i.e. when the change came from the user, not from us.
 */
export function useAutoSlug() {
  const edited = useRef(false);
  const lastAuto = useRef('');

  // Returns the slug to fill from the current name, or null if the user has
  // taken over the slug and we should leave it alone.
  const onNameChange = useCallback((name: string): string | null => {
    if (edited.current) return null;
    const next = slugify(name);
    lastAuto.current = next;
    return next;
  }, []);

  // Called for every slug change. Anything that doesn't match what we last
  // auto-filled must have come from the user, so we hand the field over to them.
  const onSlugChange = useCallback((value: string) => {
    if (value !== lastAuto.current) {
      edited.current = true;
    }
  }, []);

  return { onNameChange, onSlugChange };
}
