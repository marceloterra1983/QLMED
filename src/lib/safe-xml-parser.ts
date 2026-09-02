import xml2js from 'xml2js';

const MAX_XML_SIZE = 10 * 1024 * 1024; // 10 MB
/**
 * Profundidade de aninhamento aceita. NF-e/CT-e/NFS-e reais ficam bem abaixo de
 * 30; o teto existe porque o xml2js (sax) não tem `max depth` e um XML fundo o
 * bastante estoura a pilha do processo antes de qualquer validação nossa.
 */
const MAX_XML_DEPTH = 100;

// xml2js (sax under the hood) does not expand external entities by default, so
// classic XXE is not exploitable today. The explicit DOCTYPE reject guards
// against a future parser swap regressing this. Sefaz-issued NF-e/CT-e/NFS-e
// XML never contains DOCTYPE.
function rejectDoctype(xmlContent: string): void {
  if (/<!DOCTYPE/i.test(xmlContent)) {
    throw new Error('XML com DOCTYPE não é permitido');
  }
}

/**
 * O limite é em BYTES, não em caracteres: XML fiscal vem em ISO-8859-1 e
 * acentos custam 2 bytes em UTF-8, então `.length` subestimava o tamanho real.
 * Não decodifica nada — as chamadas já recebem string decodificada, e mexer
 * nisso quebraria o ISO-8859-1.
 */
function rejectOversized(xmlContent: string): void {
  const bytes = Buffer.byteLength(xmlContent, 'utf8');
  if (bytes > MAX_XML_SIZE) {
    throw new Error(`XML excede o limite de ${MAX_XML_SIZE / 1024 / 1024}MB`);
  }
}

/**
 * Varre as tags numa passada e recusa aninhamento acima do teto, antes de o sax
 * descer a árvore. Ignora `<?…?>`, `<!--…-->` e CDATA; DOCTYPE já foi recusado.
 */
export function getMaxXmlDepth(xmlContent: string): number {
  let depth = 0;
  let max = 0;

  for (let i = 0; i < xmlContent.length; i++) {
    if (xmlContent[i] !== '<') continue;

    // Saltar o bloco INTEIRO: parar só no abre-tag deixaria as tags de dentro
    // de um comentário contarem como aninhamento.
    if (xmlContent.startsWith('<!--', i)) {
      const end = xmlContent.indexOf('-->', i + 4);
      if (end === -1) break;
      i = end + 2;
      continue;
    }
    if (xmlContent.startsWith('<![CDATA[', i)) {
      const end = xmlContent.indexOf(']]>', i + 9);
      if (end === -1) break;
      i = end + 2;
      continue;
    }

    const next = xmlContent[i + 1];
    if (next === '?' || next === '!') { // PI e DOCTYPE (este já recusado antes)
      const end = xmlContent.indexOf('>', i);
      if (end === -1) break;
      i = end;
      continue;
    }

    if (next === '/') {
      depth--;
      continue;
    }

    // Tag de abertura. O fecho tem de ser procurado RESPEITANDO ASPAS: um valor
    // de atributo perfeitamente legal como b="/>" põe `/>` antes do primeiro
    // `>`, e a busca ingénua concluía self-closing e não contava o nível.
    // Provado pela re-auditoria: 300 000 níveis reais em 4,2 MB mediam 0 e
    // passavam, com +291 MB de RSS no parse.
    const close = findTagEnd(xmlContent, i);
    if (close === -1) break;
    i = close;
    if (xmlContent[close - 1] === '/') continue; // <tag/>

    depth++;
    if (depth > max) max = depth;
  }

  return max;
}

/**
 * Índice do `>` que fecha a tag aberta em `start`, ignorando os que estão
 * dentro de valor de atributo. Devolve -1 se a tag não fecha.
 */
function findTagEnd(xml: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < xml.length; i++) {
    const ch = xml[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') return i;
  }
  return -1;
}

function rejectDeepNesting(xmlContent: string): void {
  const depth = getMaxXmlDepth(xmlContent);
  if (depth > MAX_XML_DEPTH) {
    throw new Error(`XML excede a profundidade máxima de ${MAX_XML_DEPTH} níveis`);
  }
}

function assertSafeXml(xmlContent: string): void {
  rejectOversized(xmlContent);
  rejectDoctype(xmlContent);
  rejectDeepNesting(xmlContent);
}

/** Shared safe parser with size limit validation */
const safeXmlParser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  trim: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

/** Parse XML with size, DOCTYPE and depth checks */
export async function parseXmlSafe(xmlContent: string) {
  assertSafeXml(xmlContent);
  return safeXmlParser.parseStringPromise(xmlContent);
}

/** Parser variant without mergeAttrs (for NF-e extraction) */
const safeXmlParserNoMerge = new xml2js.Parser({
  explicitArray: false,
  ignoreAttrs: false,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

export async function parseXmlSafeNoMerge(xmlContent: string) {
  assertSafeXml(xmlContent);
  return safeXmlParserNoMerge.parseStringPromise(xmlContent);
}
