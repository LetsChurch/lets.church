import short from 'short-uuid';
import invariant from 'tiny-invariant';
import { string as zString } from 'zod';

const translator = short();

const arg = process.argv.at(-1);

invariant(arg);

const isUuid = zString().uuid().safeParse(arg).success;

if (isUuid) {
  console.log(translator.fromUUID(arg));
} else {
  console.log(translator.toUUID(arg));
}
