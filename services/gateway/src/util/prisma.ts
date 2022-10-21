import envariant from '@knpwrs/envariant';
import { PrismaClient } from '@prisma/client';

export default new PrismaClient({
  log: ['query', 'info'],
  datasources: {
    db: {
      url: envariant('DATABASE_URL'),
    },
  },
});
