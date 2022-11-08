import envariant from '@knpwrs/envariant';
import { Connection, WorkflowClient } from '@temporalio/client';
import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import z from 'zod';
import waitOn from 'wait-on';
import { processUpload } from './workflows';
import { transcriptionDoneSignal } from './workflows/transcribe';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

console.log('Waiting for Temporal');

await waitOn({
  resources: [`tcp:${TEMPORAL_ADDRESS}`],
});

console.log('Temporal is available!');

const client = new WorkflowClient({
  connection: await Connection.connect({
    address: TEMPORAL_ADDRESS,
  }),
});

const app = Fastify({ logger: true });

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app
  .withTypeProvider<ZodTypeProvider>()
  .post('/process-upload', {
    schema: {
      body: z.object({
        id: z.string().uuid(),
        url: z.string().url(),
      }),
      response: {
        204: z.null(),
      },
    },
    handler: (req, res) => {
      client.start(processUpload, {
        taskQueue: 'process-upload',
        workflowId: `process-upload:${req.body.id}`,
        args: [req.body.id],
      });

      res.status(204).send();
    },
  })
  .post('/process-transcript/:uploadId', {
    schema: {
      body: z.object({
        transcriptId: z.string(), // NOT UUID
        status: z.enum(['completed', 'error'] as const),
      }),
      params: z.object({
        uploadId: z.string().uuid(),
      }),
      response: {
        204: z.null(),
      },
    },
    handler: (req, res) => {
      const { uploadId } = req.params;

      client
        .getHandle(`transcribe:${uploadId}`)
        .signal(transcriptionDoneSignal, req.body);

      res.status(204).send();
    },
  });

app.listen({ host: '0.0.0.0', port: 3000 }, (e) => {
  if (e) {
    console.log('Error listening:');
    console.log(e);
  }
  console.log(' 🌐 Listening on port 3000...');
});
