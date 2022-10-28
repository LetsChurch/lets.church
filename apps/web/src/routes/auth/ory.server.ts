import envariant from '@knpwrs/envariant';
import camelcaseKeys from 'camelcase-keys';
import * as Z from 'zod';

const ORY_KRATOS_PUBLIC_URL = envariant('ORY_KRATOS_PUBLIC_URL');
const ORY_KRATOS_BROWSER_URL = envariant('ORY_KRATOS_BROWSER_URL');

export const oryErrorSchema = Z.object({
  error: Z.object({
    code: Z.number(),
    message: Z.string(),
    reason: Z.string(),
    status: Z.string(),
  }),
});

export const userV0Schema = Z.object({
  id: Z.string().uuid(),
  traits: Z.object({
    email: Z.string().email(),
    username: Z.string(),
    fullName: Z.string(),
  }),
  verifiable_addresses: Z.array(
    Z.object({
      id: Z.string().uuid(),
      value: Z.string().email(),
      verified: Z.boolean(),
    }),
  ),
  metadata_public: Z.object({
    role: Z.enum(['user', 'admin'] as const).optional(),
  }).nullable(),
}).transform((o) => camelcaseKeys(o));

const aal = Z.enum(['aal1', 'aal2', 'aal3'] as const);

export const sessionSchema = Z.object({
  id: Z.string().uuid(),
  active: Z.boolean(),
  authenticator_assurance_level: aal,
  authentication_methods: Z.array(
    Z.object({
      method: Z.literal('password'),
      aal,
    }),
  ),
  identity: userV0Schema,
}).transform((o) => camelcaseKeys(o));

export const whoAmIResponse = sessionSchema.or(oryErrorSchema);

export async function whoAmI(cookie: string | null) {
  const res = await fetch(`${ORY_KRATOS_PUBLIC_URL}/sessions/whoami`, {
    headers: { cookie: cookie ?? '' },
  });

  return whoAmIResponse.parse(await res.json());
}

type OryFlow =
  | 'login'
  | 'registration'
  | 'verification'
  | 'recovery'
  | 'settings';

export function getSelfServiceRedirect(flow: OryFlow) {
  return [
    303,
    `${ORY_KRATOS_BROWSER_URL}/self-service/${flow}/browser`,
  ] as const;
}

async function getSelfServiceFlow(
  flow: OryFlow,
  id: string,
  cookie: string | null,
) {
  const flowParams = new URLSearchParams({ id });

  const res = await fetch(
    `${ORY_KRATOS_PUBLIC_URL}/self-service/${flow}/flows?${flowParams.toString()}`,
    { headers: { cookie: cookie ?? '' } },
  );

  return res.json();
}

const oryUiNodeSchema = Z.object({
  type: Z.enum(['input'] as const),
  group: Z.enum(['default', 'password', 'link', 'profile'] as const),
  attributes: Z.object({
    name: Z.string(),
    type: Z.enum(['hidden', 'text', 'email', 'password', 'submit'] as const),
    value: Z.string().optional(),
    required: Z.boolean().optional(),
    disabled: Z.boolean(),
    node_type: Z.enum(['input'] as const),
  }).transform((o) => camelcaseKeys(o)),
  messages: Z.array(Z.string()),
  meta: Z.object({
    label: Z.object({
      id: Z.number(),
      text: Z.string(),
      type: Z.enum(['info'] as const),
    }).optional(),
  }),
});

export type OryUiNode = ReturnType<typeof oryUiNodeSchema.parse>;

const orySelfServiceUiSchema = Z.object({
  action: Z.string().url(),
  method: Z.enum(['POST'] as const),
  nodes: Z.array(oryUiNodeSchema),
  messages: Z.array(
    Z.object({
      id: Z.number(),
      text: Z.string(),
      type: Z.enum(['info', 'error'] as const),
      context: Z.object({}),
    }),
  ).optional(),
});

const orySelfServiceFlowBaseSchema = Z.object({
  id: Z.string().uuid(),
  type: Z.enum(['browser'] as const),
  expires_at: Z.string(),
  issued_at: Z.string(),
  request_url: Z.string().url(),
  ui: orySelfServiceUiSchema,
});

const orySelfServiceLoginFlowSchema = orySelfServiceFlowBaseSchema
  .and(
    Z.object({
      created_at: Z.string(),
      updated_at: Z.string(),
      issued_at: Z.string(),
      request_url: Z.string().url(),
      refresh: Z.boolean().optional(),
      requested_aal: Z.enum(['aal1', 'aal2', 'aal3'] as const),
    }),
  )
  .transform((o) => camelcaseKeys(o));

export async function getSelfServiceLoginFlow(
  id: string,
  cookie: string | null,
) {
  const json = await getSelfServiceFlow('login', id, cookie);
  return orySelfServiceLoginFlowSchema.parse(json);
}

const orySelfServiceRegistrationFlowSchema = orySelfServiceFlowBaseSchema
  .and(
    Z.object({
      issued_at: Z.string(),
      request_url: Z.string().url(),
    }),
  )
  .transform((o) => camelcaseKeys(o));

export async function getSelfServiceRegistrationFlow(
  id: string,
  cookie: string | null,
) {
  const json = await getSelfServiceFlow('registration', id, cookie);
  return orySelfServiceRegistrationFlowSchema.parse(json);
}

const orySelfServiceVerificationFlowSchema = orySelfServiceFlowBaseSchema
  .and(
    Z.object({
      issued_at: Z.string(),
      request_url: Z.string().url(),
    }),
  )
  .transform((o) => camelcaseKeys(o));

export async function getSelfServiceVerificationFlow(
  id: string,
  cookie: string | null,
) {
  const json = await getSelfServiceFlow('verification', id, cookie);
  return orySelfServiceVerificationFlowSchema.parse(json);
}

const orySelfServiceRecoveryFlowSchema = orySelfServiceFlowBaseSchema
  .and(
    Z.object({
      issued_at: Z.string(),
      request_url: Z.string().url(),
      state: Z.enum(['choose_method', 'sent_email'] as const),
    }),
  )
  .transform((o) => camelcaseKeys(o));

export async function getSelfServiceRecoveryFlow(
  id: string,
  cookie: string | null,
) {
  const json = await getSelfServiceFlow('recovery', id, cookie);
  return orySelfServiceRecoveryFlowSchema.parse(json);
}

const orySelfServiceSettingsFlowSchema = orySelfServiceFlowBaseSchema
  .and(
    Z.object({
      issued_at: Z.string(),
      request_url: Z.string().url(),
      state: Z.enum(['show_form', 'success'] as const),
      identity: userV0Schema,
    }),
  )
  .transform((o) => camelcaseKeys(o));

export async function getSelfServiceSettingsFlow(
  id: string,
  cookie: string | null,
) {
  const json = await getSelfServiceFlow('settings', id, cookie);
  return orySelfServiceSettingsFlowSchema.parse(json);
}

const oryLogoutUrlSchema = Z.object({
  logout_token: Z.string(),
  logout_url: Z.string(),
}).transform((o) => camelcaseKeys(o));

const oryLogoutRes = oryLogoutUrlSchema.or(oryErrorSchema);

export async function getSelfServiceLogoutUrl(cookie: string | null) {
  const res = await fetch(
    `${ORY_KRATOS_PUBLIC_URL}/self-service/logout/browser`,
    { headers: { cookie: cookie ?? '' } },
  );

  return oryLogoutRes.parse(await res.json());
}
