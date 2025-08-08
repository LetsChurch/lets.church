import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';
import { z } from 'zod';

const { ZXCVBN_MINIMUM_SCORE } = z
  .object({ ZXCVBN_MINIMUM_SCORE: z.coerce.number() })
  .parse(process.env);

zxcvbnOptions.setOptions({
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
});

export default function testPassword(password: string) {
  const res = zxcvbn(password);

  if (res.score < ZXCVBN_MINIMUM_SCORE) {
    return [res.feedback.warning, ...res.feedback.suggestions]
      .filter(Boolean)
      .join(' ');
  }

  return null;
}
