import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/.env → backend/src/config 기준으로 ../../.env
const envPath = path.resolve(__dirname, '../../.env');

dotenv.config({ path: envPath });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_USER: z.string().min(1, 'DATABASE_USER is required'),
  DATABASE_PASSWORD: z.string().min(1, 'DATABASE_PASSWORD is required'),
  PORT: z.string().default('7001').transform(Number),
  CORS_ORIGIN: z.string().default('http://127.0.0.1:7000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // ── 지식베이스 RAG ──────────────────────────────────────────────────────────
  KB_EMBED_MODEL: z.string().default('bge-m3'),
  KB_LLM_MODEL: z.string().default('llama3.1:8b'),
  KB_MAX_FILE_SIZE_MB: z.string().default('100').transform(Number),
  KB_MAX_BATCH_SIZE_MB: z.string().default('1024').transform(Number),
  KB_WORKER_ENABLED: z.string().default('true').transform((v) => v === 'true'),
  KB_WORKER_CONCURRENCY: z.string().default('2').transform(Number),
  KB_EMBED_BATCH_SIZE: z.string().default('8').transform(Number),
  KB_VECTOR_DIM: z.string().default('1024').transform(Number),
  KB_CHUNK_TARGET_TOKENS: z.string().default('700').transform(Number),
  KB_CHUNK_OVERLAP_TOKENS: z.string().default('100').transform(Number),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:', _env.error.format());
  process.exit(1);
}

export const env = _env.data;
