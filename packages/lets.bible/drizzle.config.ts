import { defineConfig } from 'drizzle-kit';

const url = process.env.LETS_BIBLE_DATABASE_URL;
if (!url) {
  throw new Error('LETS_BIBLE_DATABASE_URL environment variable is required');
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
