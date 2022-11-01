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
  firstName = faker.name.firstName(),
  lastName = faker.name.firstName(),
  email = faker.internet.email(firstName, lastName),
  username = faker.internet
    .userName(firstName, lastName)
    .replace(/[^a-zA-Z0-9_-]/g, '_'),
  fullName = `${firstName} ${lastName}`,
  role = 'user',
  password = 'password',
}: Partial<{
  email: string;
  username: string;
  fullName: string;
  firstName: string;
  lastName: string;
  role: Role;
  password: string;
}> = {}) {
  return {
    schema_id: 'user_v0',
    traits: {
      email,
      username,
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
      username: 'admin',
      firstName: 'Admin',
      lastName: 'McGee',
      role: 'admin',
    }),
    createUser({
      email: 'user1@example.email',
      username: 'user1',
      firstName: 'User',
      lastName: 'One',
      role: 'user',
    }),
    createUser({
      email: 'user2@example.email',
      username: 'user2',
      firstName: 'User',
      lastName: 'Two',
      role: 'user',
    }),
    ...times(47, () => createUser()),
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
    if (!res.ok) {
      console.log('Error creating user:');
      console.dir(user, { depth: null });
    }
    console.dir(json, { depth: null });
  }
})();
