import { input, confirm } from '@inquirer/prompts';
import prisma from '../src/util/prisma';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { deleteUploadWorkflow } from '../src/temporal/workflows';
import logger from '../src/util/logger';

const id = await input({ message: 'id:' });

const { title } = await prisma.uploadRecord.findUniqueOrThrow({
  where: { id },
  select: { title: true },
});

logger.info(`Title: ${title}`);

if (
  !(await confirm({
    message: 'Delete?',
    default: false,
  }))
) {
  process.exit(0);
}

(await client).workflow.start(deleteUploadWorkflow, {
  taskQueue: BACKGROUND_QUEUE,
  workflowId: `deleteUploadRecord:${id}`,
  args: [id],
});

logger.info('Upload queued for deletion!');
