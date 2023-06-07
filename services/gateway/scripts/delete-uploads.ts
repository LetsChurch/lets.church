import { input, confirm } from '@inquirer/prompts';
import prisma from '../src/util/prisma';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { deleteUploadWorkflow } from '../src/temporal/workflows';

const slug = await input({ message: 'channel slug:' });

const recs = await prisma.uploadRecord.findMany({
  where: { channel: { slug } },
  select: { id: true, title: true },
  take: Number.MAX_SAFE_INTEGER,
});

if (
  !(await confirm({
    message: `Delete ${recs.length} upload records?`,
    default: false,
  }))
) {
  process.exit(0);
}

for (const { id, title } of recs) {
  console.log(`Queueing ${id} for deletion: ${title}`);

  await (
    await client
  ).workflow.start(deleteUploadWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `deleteUploadRecord:${id}`,
    args: [id],
  });
}

console.log(`${recs.length} uploads queued for deletion!`);
