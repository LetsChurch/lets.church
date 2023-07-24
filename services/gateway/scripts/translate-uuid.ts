import short from 'short-uuid';
import invariant from 'tiny-invariant';
import { z } from 'zod';

const translator = short();

const arg = process.argv.at(-1);

invariant(arg);

const isUuid = z.string().uuid().safeParse(arg).success;

if (isUuid) {
  console.log(translator.fromUUID(arg));
} else {
  console.log(translator.toUUID(arg));
}
