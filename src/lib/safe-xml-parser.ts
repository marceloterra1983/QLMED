import xml2js from 'xml2js';

const MAX_XML_SIZE = 10 * 1024 * 1024; // 10 MB

/** Shared safe parser with size limit validation */
export const safeXmlParser = new xml2js.Parser({
  explicitArray: false,
  mergeAttrs: true,
  trim: true,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

/** Parse XML with size limit check */
export async function parseXmlSafe(xmlContent: string) {
  if (xmlContent.length > MAX_XML_SIZE) {
    throw new Error(`XML excede o limite de ${MAX_XML_SIZE / 1024 / 1024}MB`);
  }
  return safeXmlParser.parseStringPromise(xmlContent);
}

/** Parser variant without mergeAttrs (for NF-e extraction) */
export const safeXmlParserNoMerge = new xml2js.Parser({
  explicitArray: false,
  ignoreAttrs: false,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

export async function parseXmlSafeNoMerge(xmlContent: string) {
  if (xmlContent.length > MAX_XML_SIZE) {
    throw new Error(`XML excede o limite de ${MAX_XML_SIZE / 1024 / 1024}MB`);
  }
  return safeXmlParserNoMerge.parseStringPromise(xmlContent);
}
