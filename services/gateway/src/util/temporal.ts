import { Context } from '@temporalio/activity';
import { throttle } from 'lodash-es';

export const dataHeartbeat = throttle((arg = 'data') => {
  Context.current().heartbeat(arg);
  console.log(`sent heartbeat: ${arg}`);
}, 5000);
