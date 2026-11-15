// Cálculos puros e auditáveis das ferramentas inspiradas em Liana, NDK/Nostr, KeePassXC e LND.
// Sem DOM e sem rede: tudo aqui pode ser testado isoladamente.
import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { bech32 } from '@scure/base';

/* ───────── Timelock / Herança (Liana) ───────── */
export const BLOCKS_PER_DAY = 144;
/** Limite do consenso para timelock relativo por blocos (BIP-68): 16 bits. */
export const MAX_RELATIVE_BLOCKS = 65535;

export const TIMELOCK_PRESETS = [
  { label: '1 mês', blocks: 4380 },
  { label: '3 meses', blocks: 13140 },
  { label: '6 meses', blocks: 26280 },
  { label: '9 meses', blocks: 39420 },
  { label: '1 ano', blocks: 52560 },
  { label: 'Máximo · ~15 meses', blocks: 65535 },
] as const;

export function clampBlocks(blocks: number) {
  if (!Number.isFinite(blocks)) return 1;
  return Math.min(MAX_RELATIVE_BLOCKS, Math.max(1, Math.round(blocks)));
}
export function blocksToDays(blocks: number) { return blocks / BLOCKS_PER_DAY; }

/** Descritor no formato usado pela Liana: caminho primário sempre, recuperação após N blocos. */
export function inheritanceDescriptor(primary: string, heir: string, blocks: number) {
  return `wsh(or_d(pk(${primary}),and_v(v:pkh(${heir}),older(${clampBlocks(blocks)}))))`;
}

export type InheritancePhase = 'seguro' | 'alerta' | 'heranca';
/** Fase do cofre dado quantos blocos passaram desde a última movimentação do titular. */
export function inheritancePhase(elapsed: number, blocks: number): InheritancePhase {
  const n = clampBlocks(blocks);
  if (elapsed >= n) return 'heranca';
  if (elapsed >= n * 0.8) return 'alerta';
  return 'seguro';
}

/* ───────── Diceware / Entropia (KeePassXC) ───────── */
export function entropyBits(poolSize: number, length: number) {
  if (poolSize < 2 || length < 1) return 0;
  return length * Math.log2(poolSize);
}
export function charsetSize(opts: { lower: boolean; upper: boolean; digits: boolean; symbols: boolean }) {
  return (opts.lower ? 26 : 0) + (opts.upper ? 26 : 0) + (opts.digits ? 10 : 0) + (opts.symbols ? 32 : 0);
}
/** Estimativa da força de uma senha digitada pelo próprio usuário, a partir das classes de caracteres presentes. */
export function passwordEntropy(password: string) {
  const pool = charsetSize({
    lower: /[a-z]/.test(password), upper: /[A-Z]/.test(password),
    digits: /[0-9]/.test(password), symbols: /[^A-Za-z0-9]/.test(password),
  });
  return entropyBits(pool, [...password].length);
}
/** Segundos médios para achar a senha (metade do espaço) a uma taxa de palpites por segundo. */
export function crackSeconds(bits: number, guessesPerSecond: number) {
  if (bits <= 0) return 0;
  return Math.pow(2, bits - 1) / guessesPerSecond;
}
export function strengthLabel(bits: number) {
  if (bits < 40) return 'Fraca';
  if (bits < 64) return 'Razoável';
  if (bits < 80) return 'Forte';
  return 'Blindada';
}
export function humanDuration(seconds: number) {
  if (seconds < 1) return 'instantâneo';
  const units: [number, string, string][] = [
    [31_557_600 * 1e9, 'bilhão de anos', 'bilhões de anos'], [31_557_600 * 1e6, 'milhão de anos', 'milhões de anos'],
    [31_557_600 * 1e3, 'mil anos', 'mil anos'], [31_557_600, 'ano', 'anos'], [86_400, 'dia', 'dias'],
    [3_600, 'hora', 'horas'], [60, 'minuto', 'minutos'], [1, 'segundo', 'segundos'],
  ];
  for (const [size, one, many] of units) {
    if (seconds >= size) {
      const v = seconds / size;
      if (v >= 1e6) return `mais de ${Math.floor(v).toExponential(1).replace('e+', ' × 10^')} ${many}`;
      const n = Math.floor(v);
      return `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`;
    }
  }
  return 'instantâneo';
}
/** Índice uniforme sem viés de módulo (rejection sampling). */
export function uniformIndex(max: number, random: (n: number) => Uint32Array = n => crypto.getRandomValues(new Uint32Array(n))) {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  for (;;) { const v = random(1)[0] ?? limit; if (v < limit) return v % max; }
}

/* ───────── Nostr (NDK) ───────── */
export function encodeNostr(prefix: 'npub' | 'nsec' | 'note', hex: string) {
  return bech32.encode(prefix, bech32.toWords(hexToBytes(hex)), 1000);
}
export function decodeNostr(value: string) {
  const { prefix, words } = bech32.decode(value.trim().toLowerCase() as `${string}1${string}`, 1000);
  return { prefix, hex: bytesToHex(bech32.fromWords(words)) };
}
export function nostrKeysFromSecret(secretHex: string) {
  const pub = bytesToHex(schnorr.getPublicKey(hexToBytes(secretHex)));
  return { secretHex, pubHex: pub, nsec: encodeNostr('nsec', secretHex), npub: encodeNostr('npub', pub) };
}
export function generateNostrKeys() { return nostrKeysFromSecret(bytesToHex(schnorr.utils.randomSecretKey())); }

export interface NostrEvent { id: string; pubkey: string; created_at: number; kind: number; tags: string[][]; content: string; sig: string }
/** NIP-01: id = sha256 da serialização canônica [0,pubkey,created_at,kind,tags,content]. */
export function nostrEventId(pubkey: string, created_at: number, kind: number, tags: string[][], content: string) {
  return bytesToHex(sha256(utf8ToBytes(JSON.stringify([0, pubkey, created_at, kind, tags, content]))));
}
export function signNostrEvent(secretHex: string, content: string, created_at: number, kind = 1, tags: string[][] = []): NostrEvent {
  const pubkey = bytesToHex(schnorr.getPublicKey(hexToBytes(secretHex)));
  const id = nostrEventId(pubkey, created_at, kind, tags, content);
  const sig = bytesToHex(schnorr.sign(hexToBytes(id), hexToBytes(secretHex)));
  return { id, pubkey, created_at, kind, tags, content, sig };
}
export function verifyNostrEvent(e: NostrEvent) {
  try {
    if (nostrEventId(e.pubkey, e.created_at, e.kind, e.tags, e.content) !== e.id) return false;
    return schnorr.verify(hexToBytes(e.sig), hexToBytes(e.id), hexToBytes(e.pubkey));
  } catch { return false; }
}

/* ───────── Lightning (LND) ───────── */
/** Taxa de encaminhamento de um canal: base em msat + proporcional em partes por milhão. */
export function forwardingFeeMsat(amountSat: number, baseMsat: number, ppm: number) {
  return Math.floor(baseMsat + (amountSat * 1000 * ppm) / 1_000_000);
}
export interface Hop { name: string; baseMsat: number; ppm: number }
/** Taxa total de uma rota: cada nó intermediário cobra sobre o valor que precisa repassar adiante. */
export function routeFeeSat(amountSat: number, hops: Hop[]) {
  let forwardMsat = amountSat * 1000;
  let totalMsat = 0;
  for (let i = hops.length - 1; i >= 0; i--) {
    const hop = hops[i]!; const fee = Math.floor(hop.baseMsat + (forwardMsat * hop.ppm) / 1_000_000);
    totalMsat += fee; forwardMsat += fee;
  }
  return totalMsat / 1000;
}
export function channelBalance(capacitySat: number, localSat: number) {
  const local = Math.min(Math.max(0, localSat), capacitySat);
  return { outbound: local, inbound: capacitySat - local, localPct: capacitySat ? (local / capacitySat) * 100 : 0 };
}
/** Um pagamento cabe no canal se não ultrapassar o saldo do lado de quem envia menos a reserva (1% padrão). */
export function canRoute(amountSat: number, sideSat: number, capacitySat: number, reservePct = 1) {
  return amountSat > 0 && amountSat <= sideSat - Math.ceil((capacitySat * reservePct) / 100);
}
