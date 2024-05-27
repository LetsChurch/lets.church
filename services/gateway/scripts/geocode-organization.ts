import { input, confirm } from '@inquirer/prompts';
import prisma from '../src/util/prisma';
import { geocodeOrganization } from '../src/temporal';
import logger from '../src/util/logger';

const slug = await input({ message: 'slug:' });

const { id, name } = await prisma.organization.findUniqueOrThrow({
  where: { slug },
});

logger.info(`Name: ${name}`);

if (
  !(await confirm({
    message: 'Geocode organization?',
    default: false,
  }))
) {
  process.exit(0);
}

await geocodeOrganization(id);

logger.info('Organization queued for geocoding!');
