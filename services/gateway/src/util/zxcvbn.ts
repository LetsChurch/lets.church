import envariant from '@knpwrs/envariant';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import zxcvbnEnPackage from '@zxcvbn-ts/language-en';

const options = {
  translations: zxcvbnEnPackage.translations,
  graphs: zxcvbnCommonPackage.adjacencyGraphs,
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
};

zxcvbnOptions.setOptions(options);

const zxcvnMinimumScore = parseInt(envariant('ZXCVBN_MINIMUM_SCORE'));

export default function testPassword(password: string) {
  const res = zxcvbn(password);

  if (res.score < zxcvnMinimumScore) {
    return [res.feedback.warning, ...res.feedback.suggestions]
      .filter(Boolean)
      .join(' ');
  }

  return null;
}
