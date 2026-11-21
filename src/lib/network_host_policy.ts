// 患者情報を扱う外部・施設内エンドポイントのホスト判定（Q-4 正本）。
// `new URL()` は IPv4 を 10進ドット表記へ正規化して返す（例: http://0x7f.1 → 127.0.0.1）。
// 前方一致（`startsWith('127.')` や `startsWith('10.')` 等）で判定すると
// `127.0.0.1.example.com` や `10.example.com` のような外部ドメインを
// ループバック／施設内 LAN と誤認し、患者データを平文 HTTP や院外へ送信できてしまう。
// 必ず 4 オクテット数値として厳密に解釈する。

export type EndpointHostClassification = 'localhost' | 'private_network' | 'external';

export function normalizeEndpointHostname(hostname: string): string {
  return String(hostname || '').trim().toLowerCase();
}

export function parseIPv4(host: string): [number, number, number, number] | null {
  const normalized = normalizeEndpointHostname(host);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (!match) return null;
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return null;
  }
  return octets as [number, number, number, number];
}

export function isLoopbackHost(host: string): boolean {
  const normalized = normalizeEndpointHostname(host);
  // URL.hostname の IPv6 は角括弧つき（`[::1]`）で返る
  if (normalized === 'localhost' || normalized === '::1' || normalized === '[::1]') {
    return true;
  }
  return parseIPv4(normalized)?.[0] === 127;
}

export function isPrivateLanHost(host: string): boolean {
  const normalized = normalizeEndpointHostname(host);
  // mDNS 名（例: main-hub.local）は同一リンク内でしか解決されない
  if (normalized.endsWith('.local') && normalized.length > '.local'.length) {
    return true;
  }
  const octets = parseIPv4(normalized);
  if (!octets) return false;
  const [first, second] = octets;
  return (
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31)
  );
}

export function classifyEndpointHost(hostname: string): EndpointHostClassification {
  const normalized = normalizeEndpointHostname(hostname);
  if (isLoopbackHost(normalized)) return 'localhost';
  if (isPrivateLanHost(normalized)) return 'private_network';
  return 'external';
}
