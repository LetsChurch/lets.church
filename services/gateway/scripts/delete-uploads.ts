import { readFile } from 'node:fs/promises';
import { input, confirm, select } from '@inquirer/prompts';
import prisma from '../src/util/prisma';
import { client } from '../src/temporal';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { deleteUploadWorkflow } from '../src/temporal/workflows';

const source = await select({
  message: 'What do you want to delete?',
  choices: [
    { name: 'List of IDs', value: 'ids' },
    { name: 'Uploads from Channel Slug', value: 'slug' },
  ],
});

let ids: Array<string> = [];

if (source === 'slug') {
  const slug = await input({ message: 'channel slug:' });

  const recs = await prisma.uploadRecord.findMany({
    where: { channel: { slug } },
    select: { id: true, title: true },
    take: Number.MAX_SAFE_INTEGER,
  });

  ids = recs.map((r) => r.id);
} else if (source === 'ids') {
  const subSource = await select({
    message: 'IDs from:',
    choices: [
      { name: 'File', value: 'file' },
      { name: 'Input', value: 'input' },
    ],
  });
  if (subSource === 'file') {
    const filename = await input({ message: 'File name:' });
    const text = await readFile(filename, 'utf-8');
    ids = text.trim().split(/\n/g);
  } else {
    ids = (await input({ message: 'ids (comma-separated):' }))
      .split(/,/g)
      .map((s) => s.trim());
  }
}

if (
  !(await confirm({
    message: `Delete ${ids.length} upload records?`,
    default: false,
  }))
) {
  process.exit(0);
}

for (const id of ids) {
  console.log(`Queueing ${id} for deletion`);

  await (
    await client
  ).workflow.start(deleteUploadWorkflow, {
    taskQueue: BACKGROUND_QUEUE,
    workflowId: `deleteUploadRecord:${id}`,
    args: [id],
  });
}

console.log(`${ids.length} uploads queued for deletion!`);
