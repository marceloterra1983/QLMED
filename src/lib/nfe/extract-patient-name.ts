/**
 * Extrai o nome do paciente de <infCpl> de NF-e emitida (SPEC-052).
 * Padrão dominante QLMED: "(Paciente NOME COMPLETO)" — opcionalmente
 * seguido de " - ATEND.: 12345" antes do fecha-parênteses.
 */

export function extractInfCpl(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const m = xmlContent.match(/<infCpl>([\s\S]*?)<\/infCpl>/i);
  if (!m?.[1]) return null;
  return m[1].replace(/\s+/g, ' ').trim() || null;
}

export function extractPatientNameFromInfCpl(infCpl: string | null | undefined): string | null {
  if (!infCpl) return null;
  const m = infCpl.match(/\(\s*Paciente\s+([^)]+?)\s*\)/i);
  if (!m?.[1]) return null;
  let name = m[1].replace(/\s+/g, ' ').trim();
  // Remove atendimento / matrícula colados no mesmo token
  name = name.replace(/\s*[-–—]\s*ATEND\.?:?\s*\S+/i, '').trim();
  name = name.replace(/\s{2,}/g, ' ').trim();
  if (name.length < 3) return null;
  // Exige ao menos 2 tokens alfabéticos (evita lixo)
  const tokens = name.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t));
  if (tokens.length < 2) return null;
  return name.toUpperCase();
}

export function extractPatientNameFromXml(xmlContent: string | null | undefined): string | null {
  return extractPatientNameFromInfCpl(extractInfCpl(xmlContent));
}
