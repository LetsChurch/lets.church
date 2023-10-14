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
import * as activities from '../activities/transcode';
import { TRANSCODE_QUEUE } from '../queues';
import { waitOnTemporal } from '..';
import { checkAudiowaveform, checkFfmpeg } from '../../util/env-check';

await checkFfmpeg();
await checkAudiowaveform();

const TEMPORAL_ADDRESS = envariant('TEMPORAL_ADDRESS');
const MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS = envariant(
  'MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS',
);

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

await waitOnTemporal();

const worker = await Worker.create({
  identity: `transcode-worker ${envariant('IDENTITY')}`,
  connection: await NativeConnection.connect({ address: TEMPORAL_ADDRESS }),
  activities,
  taskQueue: TRANSCODE_QUEUE,
  maxConcurrentActivityTaskExecutions: parseInt(
    MAX_CONCURRENT_ACTIVITY_TASK_EXECUTIONS,
    10,
  ),
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
  await worker.run();
} finally {
  await otel.shutdown();
}
