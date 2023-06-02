import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { client } from '../src/temporal';
import prisma from '../src/util/prisma';
import { deleteUploadWorkflow } from '../src/temporal/workflows';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { emptySignal } from '../src/temporal/signals';
import { listIds } from '../src/util/elasticsearch';

const spinner = ora('Checking for missing upload records:').start();

const errorKeys = [];

for await (const id of listIds('lc_uploads')) {
  spinner.text = `Checking for missing upload records: ${id}`;

  const res = await prisma.uploadRecord.findUnique({
    select: { id: true },
    where: { id: id },
  });

  if (!res) {
    errorKeys.push(id);
  }
}

spinner.text = 'Checking for missing transcript records:';

for await (const prefix of listIds('lc_transcripts')) {
  spinner.text = `Checking for missing transcript records: ${prefix}`;

  const res = await prisma.uploadRecord.findUnique({
    select: { id: true },
    where: { id: prefix },
  });

  if (!res) {
    errorKeys.push(prefix);
  }
}

spinner.succeed('Done!');

if (
  errorKeys.length > 0 &&
  (await confirm({
    message: `Queue ${errorKeys.length} for deletion?`,
    default: false,
  }))
) {
  for (const id of errorKeys) {
    await (
      await client
    ).workflow.signalWithStart(deleteUploadWorkflow, {
      taskQueue: BACKGROUND_QUEUE,
      workflowId: `deleteUploadRecord:${id}`,
      args: [id],
      signal: emptySignal,
      signalArgs: [],
    });
  }
}
