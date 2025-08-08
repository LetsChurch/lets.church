import ora from 'ora';
import { confirm } from '@inquirer/prompts';
import { client } from '../src/temporal';
import prisma from '../src/util/prisma';
import { listPrefixes } from '../src/util/s3';
import { deleteUploadWorkflow } from '../src/temporal/workflows';
import { BACKGROUND_QUEUE } from '../src/temporal/queues';
import { emptySignal } from '../src/temporal/signals';

const spinner = ora('Checking for missing ingest records:').start();

const errorKeys = [];

async function dbRecordExists(id: string) {
  const upRec = await prisma.uploadRecord.findUnique({
    select: { id: true },
    where: { id },
  });

  if (upRec) {
    return true;
  }

  const chanRec = await prisma.channel.findUnique({
    select: { id: true },
    where: { id },
  });

  if (chanRec) {
    return true;
  }

  const userRec = await prisma.appUser.findUnique({
    select: { id: true },
    where: { id },
  });

  if (userRec) {
    return true;
  }

  return false;
}

for await (const prefix of listPrefixes('INGEST')) {
  spinner.text = `Checking for missing ingest records: ${prefix}`;

  if (!(await dbRecordExists(prefix))) {
    errorKeys.push(prefix);
  }
}

spinner.text = 'Checking for missing public records:';

for await (const prefix of listPrefixes('PUBLIC')) {
  spinner.text = `Checking for missing public records: ${prefix}`;

  if (!(await dbRecordExists(prefix))) {
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
