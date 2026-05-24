import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const LOG_DIR = path.join(__dirname, '..', 'ollama_log');
const CACHE_FILE = path.join(LOG_DIR, 'cache.json');
const HISTORY_FILE = path.join(LOG_DIR, 'history.jsonl');

async function ensureLogDir() {
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
  } catch (e) {}
}

function hashPrompt(prompt: string): string {
  return crypto.createHash('sha256').update(prompt).digest('hex');
}

export async function getCachedResponse(prompt: string): Promise<any | null> {
  await ensureLogDir();
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cache = JSON.parse(data);
    const hash = hashPrompt(prompt);
    if (cache[hash]) {
      console.log(`[Cache Hit] Serving cached response for hash: ${hash.substring(0, 8)}...`);
      return cache[hash];
    }
  } catch (e) {
    // Cache miss or file doesn't exist
  }
  return null;
}

export async function setCachedResponse(prompt: string, response: any, type: 'chat' | 'json', durationMs?: number): Promise<void> {
  await ensureLogDir();
  const hash = hashPrompt(prompt);

  // 1. Update cache.json
  let cache: Record<string, any> = {};
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    cache = JSON.parse(data);
  } catch (e) {}

  cache[hash] = response;
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));

  const responseStr = typeof response === 'string' ? response : JSON.stringify(response);
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    prompt_hash: hash.substring(0, 12),
    response_hash: crypto.createHash('sha256').update(responseStr).digest('hex').substring(0, 12),
    prompt_token_count: Math.round(prompt.length / 4), // rough estimate: ~4 chars/token
    response_token_count: Math.round(responseStr.length / 4),
    duration_ms: durationMs ?? null,
    cache_hit: false,
  };
  await fs.appendFile(HISTORY_FILE, JSON.stringify(logEntry) + '\n');
}
