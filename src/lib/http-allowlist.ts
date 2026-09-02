/**
 * Portão único de egresso HTTP: decide se uma URL pode receber uma credencial
 * nossa (Bearer, apikey, ou o certificado de cliente do e-CNPJ).
 *
 * Existe porque três integrações seguiam URL vinda de fora — `@odata.nextLink`
 * do Graph, `baseUrl` gravado pelo admin, cursor de paginação — e anexavam a
 * credencial ao destino sem verificar QUAL era o destino. Um `nextLink`
 * apontando para outro host bastava para o token sair do prédio.
 *
 * A checagem é síncrona de propósito: ela não resolve DNS. O que ela recusa é
 * o que dá para provar a partir da própria URL. A allowlist é o controlo real;
 * as demais regras só fecham as fugas óbvias em volta dela.
 */

/** Faixas IPv4 que nunca são destino legítimo de credencial nossa. */
const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ['0.0.0.0', 8], // "este host"
  ['10.0.0.0', 8], // RFC1918
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local — inclui 169.254.169.254 (metadados de nuvem)
  ['172.16.0.0', 12], // RFC1918
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // RFC1918
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservado
];

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    // Recusa "01", "0x7f" e vazio: o parser do SO aceitaria, o nosso não.
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    if (part.length > 1 && part.startsWith('0')) return null;
    value = value * 256 + octet;
  }
  return value;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return PRIVATE_IPV4_RANGES.some(([range, bits]) => {
    const base = ipv4ToInt(range);
    if (base === null) return false;
    const mask = bits === 0 ? 0 : (-1 << (32 - bits)) >>> 0;
    return (value & mask) >>> 0 === (base & mask) >>> 0;
  });
}

function isPrivateIpv6(host: string): boolean {
  const ip = host.toLowerCase();

  // IPv4 embutido reaproveita a decisão do IPv4. O WHATWG normaliza
  // `::ffff:127.0.0.1` para a forma hexadecimal `::ffff:7f00:1`, então as duas
  // grafias precisam ser reconhecidas.
  const dotted = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) return isPrivateIpv4(dotted[1]);

  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return isPrivateIpv4(
      [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.'),
    );
  }

  if (ip === '::1' || ip === '::') return true;
  if (/^f[cd][0-9a-f]{2}:/.test(ip)) return true; // ULA fc00::/7
  if (/^fe[89ab][0-9a-f]:/.test(ip)) return true; // link-local fe80::/10
  return false;
}

/**
 * Valida uma URL de egresso e devolve a URL normalizada.
 *
 * Garante, ou lança `Error`:
 * - a string parseia como URL absoluta;
 * - o esquema é `https:` — nunca http, file, data ou gopher;
 * - não há usuário/senha embutidos na URL;
 * - o host não é um IP literal privado, loopback, link-local ou multicast
 *   (bloqueia `169.254.169.254` e `127.0.0.1` mesmo se listados);
 * - o host está na `allowlist`, comparado por igualdade exata, sem distinção
 *   de maiúsculas e sem o ponto final do FQDN. Não há curinga: `evil.graph.com`
 *   não passa por `graph.com` estar na lista.
 *
 * Serve tanto para a entrada (baseUrl configurado) quanto para o salto seguinte
 * (nextLink, cursor, redirect) — é a mesma pergunta nos dois casos.
 *
 * @param url URL a validar.
 * @param allowlist Hosts permitidos. Lista vazia recusa tudo (fail-closed).
 * @returns A `URL` já parseada, para o chamador usar sem re-parsear.
 */
export function assertAllowedHost(url: string, allowlist: readonly string[]): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('URL de egresso inválida');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`Egresso recusado: esquema ${parsed.protocol} não é https`);
  }

  if (parsed.username || parsed.password) {
    throw new Error('Egresso recusado: URL com credenciais embutidas');
  }

  // `hostname` vem sem a porta, mas MANTÉM os colchetes do IPv6 — sem tirá-los
  // o literal `[::1]` não casaria com nenhuma faixa privada e escaparia.
  const host = parsed.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (!host) {
    throw new Error('Egresso recusado: URL sem host');
  }

  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new Error(`Egresso recusado: ${host} é endereço privado ou loopback`);
  }

  const allowed = allowlist.some(
    (entry) => entry.trim().toLowerCase().replace(/\.$/, '') === host,
  );
  if (!allowed) {
    throw new Error(`Egresso recusado: host ${host} fora da allowlist`);
  }

  return parsed;
}
