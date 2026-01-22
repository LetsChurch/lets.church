import type { UploadLicense } from '@letschurch/db/types';

export type LicenseInfo = {
  name: string;
  description: string;
  url?: string;
};

export function getLicenseInfo(license: UploadLicense): LicenseInfo {
  switch (license) {
    case 'STANDARD':
      return {
        name: 'Standard License',
        description:
          'Standard copyright. All rights reserved by the content owner.',
      };
    case 'PUBLIC_DOMAIN':
      return {
        name: 'Public Domain',
        description:
          'This content is in the public domain and can be used freely without restrictions.',
      };
    case 'CC0':
      return {
        name: 'CC0 1.0 Universal',
        description:
          'The creator has waived all copyright and related rights. You can copy, modify, distribute and perform the work, even for commercial purposes, all without asking permission.',
        url: 'https://creativecommons.org/publicdomain/zero/1.0/',
      };
    case 'CC_BY':
      return {
        name: 'CC BY 4.0',
        description:
          'You are free to share and adapt this work, even commercially, as long as you give appropriate credit to the creator.',
        url: 'https://creativecommons.org/licenses/by/4.0/',
      };
    case 'CC_BY_SA':
      return {
        name: 'CC BY-SA 4.0',
        description:
          'You are free to share and adapt this work, even commercially, as long as you give appropriate credit and distribute your contributions under the same license.',
        url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      };
    case 'CC_BY_NC':
      return {
        name: 'CC BY-NC 4.0',
        description:
          'You are free to share and adapt this work for non-commercial purposes only, as long as you give appropriate credit.',
        url: 'https://creativecommons.org/licenses/by-nc/4.0/',
      };
    case 'CC_BY_NC_SA':
      return {
        name: 'CC BY-NC-SA 4.0',
        description:
          'You are free to share and adapt this work for non-commercial purposes only, as long as you give appropriate credit and distribute your contributions under the same license.',
        url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
      };
    case 'CC_BY_ND':
      return {
        name: 'CC BY-ND 4.0',
        description:
          'You are free to share this work, even commercially, as long as you give appropriate credit and do not modify it.',
        url: 'https://creativecommons.org/licenses/by-nd/4.0/',
      };
    case 'CC_BY_NC_ND':
      return {
        name: 'CC BY-NC-ND 4.0',
        description:
          'You are free to share this work for non-commercial purposes only, as long as you give appropriate credit and do not modify it.',
        url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
      };
  }
}
