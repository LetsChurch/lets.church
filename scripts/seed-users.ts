import { faker } from '@faker-js/faker';
import envariant from '@knpwrs/envariant';

const HOST_ORY_KRATOS_ADMIN_PORT = envariant('HOST_ORY_KRATOS_ADMIN_PORT');

faker.seed(1337);

function times<T>(n: number, fn: () => T): Array<T> {
  return Array(n)
    .fill(null)
    .map(() => fn());
}

type Role = 'admin' | 'user';

function createUser({
  email = faker.internet.email(),
  fullName = `${faker.name.firstName()} ${faker.name.lastName()}`,
  role = 'user',
  password = 'password',
}: Partial<{
  email: string;
  fullName: string;
  role: Role;
  password: string;
}> = {}) {
  return {
    schema_id: 'user_v0',
    traits: {
      email,
      fullName,
    },
    metadata_public: {
      role,
    },
    verifiable_addresses: [
      {
        value: email,
        verified: true,
        via: 'email',
        status: 'completed',
      },
    ],
    credentials: {
      password: {
        config: {
          password,
        },
      },
    },
  };
}

void (async function main() {
  const users = [
    createUser({
      email: 'admin@lets.church',
      fullName: 'Admin McGee',
      role: 'admin',
    }),
    ...times(49, () => createUser()),
  ];

  for (const user of users) {
    const res = await fetch(
      `http://localhost:${HOST_ORY_KRATOS_ADMIN_PORT}/identities`,
      {
        method: 'POST',
        body: JSON.stringify(user),
      },
    );
    const json = await res.json();
    console.dir(json, { depth: null });
  }
})();
