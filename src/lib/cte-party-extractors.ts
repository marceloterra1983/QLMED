/**
 * CTE party extractors from raw fiscal XML.
 * Shared so route handlers only orchestrate auth/validation/delegation.
 */

export function decodeXmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractCteCnpjFromBlock(block: string | null | undefined): string | null {
  if (!block) return null;
  const cnpj = block.match(/<CNPJ>([\s\S]*?)<\/CNPJ>/i)?.[1]?.replace(/\D/g, '').trim();
  if (cnpj) return cnpj;
  const cpf = block.match(/<CPF>([\s\S]*?)<\/CPF>/i)?.[1]?.replace(/\D/g, '').trim();
  return cpf || null;
}

export function extractCteRemetenteName(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;

  const remBlock = xmlContent.match(/<rem\b[\s\S]*?<\/rem>/i)?.[0];
  const remName = remBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (remName) {
    const decodedRem = decodeXmlEntities(remName).replace(/\s+/g, ' ').trim();
    if (decodedRem) return decodedRem;
  }

  // Fallback: when there is no remetente, use expedidor from the XML.
  const expedBlock = xmlContent.match(/<exped\b[\s\S]*?<\/exped>/i)?.[0];
  const expedName = expedBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (!expedName) return null;
  const decodedExped = decodeXmlEntities(expedName).replace(/\s+/g, ' ').trim();
  return decodedExped || null;
}

export function extractCteRemetenteCnpj(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const remBlock = xmlContent.match(/<rem\b[\s\S]*?<\/rem>/i)?.[0];
  const cnpj = extractCteCnpjFromBlock(remBlock);
  if (cnpj) return cnpj;
  const expedBlock = xmlContent.match(/<exped\b[\s\S]*?<\/exped>/i)?.[0];
  return extractCteCnpjFromBlock(expedBlock);
}

export function extractCteRecebedorCnpj(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const recebBlock = xmlContent.match(/<receb\b[\s\S]*?<\/receb>/i)?.[0];
  const cnpj = extractCteCnpjFromBlock(recebBlock);
  if (cnpj) return cnpj;
  const destBlock = xmlContent.match(/<dest\b[\s\S]*?<\/dest>/i)?.[0];
  return extractCteCnpjFromBlock(destBlock);
}

export function extractCteRecebedorName(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;

  const recebBlock = xmlContent.match(/<receb\b[\s\S]*?<\/receb>/i)?.[0];
  const recebName = recebBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (recebName) {
    const decodedReceb = decodeXmlEntities(recebName).replace(/\s+/g, ' ').trim();
    if (decodedReceb) return decodedReceb;
  }

  // Fallback: when there is no recebedor, use destinatário from the XML.
  const destBlock = xmlContent.match(/<dest\b[\s\S]*?<\/dest>/i)?.[0];
  const destName = destBlock?.match(/<xNome>([\s\S]*?)<\/xNome>/i)?.[1];
  if (!destName) return null;
  const decodedDest = decodeXmlEntities(destName).replace(/\s+/g, ' ').trim();
  return decodedDest || null;
}
