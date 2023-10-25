import { NativeConnection, Worker, defaultSinks } from '@temporalio/worker';
import envariant from '@knpwrs/envariant';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-base';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { Resource } from '@opentelemetry/resources';
import {
  OpenTelemetryActivityInboundInterceptor,
  makeWorkflowExporter,
} from '@temporalio/interceptors-opentelemetry/lib/worker';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import * as Sentry from '@sentry/node';
import * as importActivities from '../activities/import';
import { IMPORT_QUEUE } from '../queues';
import { checkYtDlp } from '../../util/env-check';

Sentry.init({
  dsn: envariant('SENTRY_DSN'),
  environment: process.env['NODE_ENV'] ?? 'default',
});

await checkYtDlp();

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');

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

const importWorker = await Worker.create({
  identity: `import-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities: importActivities,
  taskQueue: IMPORT_QUEUE,
  shutdownGraceTime: envariant('TEMPORAL_SHUTDOWN_GRACE_TIME'),
  maxConcurrentWorkflowTaskExecutions: 2,
  maxConcurrentActivityTaskExecutions: 2,
  sinks: {
    ...defaultSinks,
    exporter: makeWorkflowExporter(exporter, resource),
  },
  interceptors: {
    activityInbound: [
      (ctx) => new OpenTelemetryActivityInboundInterceptor(ctx),
    ],
  },
});

try {
  await importWorker.run();
} finally {
  await otel.shutdown();
}
