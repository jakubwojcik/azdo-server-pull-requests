import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier/flat';

export default defineConfig(
  { ignores: ['dist/'] },
  tseslint.configs.recommended,
  prettier,
);
