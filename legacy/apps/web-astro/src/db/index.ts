import { drizzle } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from 'astro:env/server';

export const db = drizzle(DATABASE_URL, { casing: 'snake_case' });
