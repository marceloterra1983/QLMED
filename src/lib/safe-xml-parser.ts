import xml2js from 'xml2js';

const MAX_XML_SIZE = 10 * 1024 * 1024; // 10 MB

// xml2js (sax under the hood) does not expand external entities by default, so
// classic XXE is not exploitable today. The explicit DOCTYPE reject guards
// against a future parser swap regressing this. Sefaz-issued NF-e/CT-e/NFS-e
// XML never contains DOCTYPE.
function rejectDoctype(xmlContent: string): void {
  if (/<!DOCTYPE/i.test(xmlContent)) {
    throw new Error('XML com DOCTYPE não é permitido');
  }
}

/** Shared safe parser with size limit validation */
const safeXmlParser = new xml2js.Parser({
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
  rejectDoctype(xmlContent);
  return safeXmlParser.parseStringPromise(xmlContent);
}

/** Parser variant without mergeAttrs (for NF-e extraction) */
const safeXmlParserNoMerge = new xml2js.Parser({
  explicitArray: false,
  ignoreAttrs: false,
  tagNameProcessors: [xml2js.processors.stripPrefix],
});

export async function parseXmlSafeNoMerge(xmlContent: string) {
  if (xmlContent.length > MAX_XML_SIZE) {
    throw new Error(`XML excede o limite de ${MAX_XML_SIZE / 1024 / 1024}MB`);
  }
  rejectDoctype(xmlContent);
  return safeXmlParserNoMerge.parseStringPromise(xmlContent);
}
