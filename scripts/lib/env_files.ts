import { existsSync } from 'node:fs';

// `next start` と同じ順序で .env ファイルを読む。loadEnvFile は設定済みの値を上書きしないので、
// OSの環境変数 > .env.production.local > .env.local > .env.production > .env の優先になる。
export function loadEnvFiles(): void {
  for (const file of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    if (existsSync(file)) process.loadEnvFile(file);
  }
}
