import path from 'node:path';
import { NativeConnection, Worker, defaultSinks } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
// TODO: finish auto instrumentation
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import {
  OpenTelemetryActivityInboundInterceptor,
  makeWorkflowExporter,
} from '@temporalio/interceptors-opentelemetry/lib/worker';
import * as backgroundctivities from '../activities/background';
import { BACKGROUND_QUEUE } from '../queues';
import { waitOnTemporal } from '..';

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

await waitOnTemporal();

const workflowsPath = new URL(
  `../workflows/index${path.extname(import.meta.url)}`,
  import.meta.url,
).pathname;

const exporter = process.env['OTEL_EXPORTER_OTLP_ENDPOINT']
  ? new OTLPTraceExporter({
      url: envariant('OTEL_EXPORTER_OTLP_ENDPOINT'), // TODO: get from env
      headers: Object.fromEntries(
        envariant('OTEL_EXPORTER_OTLP_HEADERS')
          .split(',')
          .map((keyval) => keyval.split('=')),
      ),
    })
  : new ConsoleSpanExporter();

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: envariant('OTEL_SERVICE_NAME'),
});

const otel = new NodeSDK({
  traceExporter: exporter,
  resource,
  instrumentations: getNodeAutoInstrumentations(),
});

otel.start();

const backgroundWorker = await Worker.create({
  identity: `background-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  // TODO: prebundle
  workflowsPath,
  activities: backgroundctivities,
  taskQueue: BACKGROUND_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
  sinks: {
    ...defaultSinks,
    exporter: makeWorkflowExporter(exporter, resource),
  },
  interceptors: {
    workflowModules: [workflowsPath],
    activityInbound: [
      (ctx) => new OpenTelemetryActivityInboundInterceptor(ctx),
    ],
  },
});

try {
  await backgroundWorker.run();
} finally {
  await otel.shutdown();
}
