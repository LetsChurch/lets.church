import { input, confirm } from '@inquirer/prompts';
import prisma from '../src/util/prisma';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { processMediaWorkflow } from '../src/temporal/workflows';

const id = await input({ message: 'id:' });

const { title, finalizedUploadKey } =
  await prisma.uploadRecord.findUniqueOrThrow({
    where: { id },
    select: { title: true, finalizedUploadKey: true },
  });

if (!finalizedUploadKey) {
  console.log(`No finalized upload key for ${id}: ${title}`);
  process.exit(-1);
}

console.log(`Title: ${title}`);

if (
  !(await confirm({
    message: 'Retry processing?',
    default: false,
  }))
) {
  process.exit(0);
}

(await client).workflow.start(processMediaWorkflow, {
  args: [id, finalizedUploadKey],
  workflowId: `processMedia:${finalizedUploadKey}:retry${Date.now()}`,
  taskQueue: BACKGROUND_QUEUE,
  retry: {
    maximumAttempts: 5,
  },
});

console.log('Upload queued for reprocessing!');
