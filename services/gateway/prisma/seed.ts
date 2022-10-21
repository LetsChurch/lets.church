import { faker } from '@faker-js/faker';
import envariant from '@knpwrs/envariant';
import prisma from '../src/util/prisma';

const ORY_KRATOS_ADMIN_URL = envariant('ORY_KRATOS_ADMIN_URL');

faker.seed(1337);

void (async function main() {
  const oryRes = await fetch(`${ORY_KRATOS_ADMIN_URL}/identities`);
  const oryIdents = await oryRes.json();
  const res = await prisma.appUser.createMany({
    data: oryIdents.map(
      (o: { id: string; metadata_public: { role: 'admin' | 'user' } }) => ({
        id: o.id,
      }),
    ),
    skipDuplicates: true,
  });

  console.dir(res, { depth: null });
})();
