// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import solid from 'eslint-plugin-solid/configs/recommended';

export default tseslint.config(
  {
    ignores: ['.output/', '.vinxi/', '**/__generated__/**/*'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  solid,
  {
    settings: {
      'import/resolver-next': [createTypeScriptImportResolver()],
    },
  },
);
