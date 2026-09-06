/**
 * Extrai paciente / convênio / médico de <infCpl> de NF-e emitida
 * (SPEC-052 + SPEC-054). Padrão QLMED:
 * "(Paciente NOME) (Convenio X) (Medico NOME) …"
 * O XML às vezes quebra linhas com "|" — normalizamos para espaço.
 */

function normalizeInfCplText(raw: string): string {
  return raw.replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractInfCpl(xmlContent: string | null | undefined): string | null {
  if (!xmlContent) return null;
  const m = xmlContent.match(/<infCpl>([\s\S]*?)<\/infCpl>/i);
  if (!m?.[1]) return null;
  return normalizeInfCplText(m[1]) || null;
}

function cleanParenValue(raw: string): string {
  return normalizeInfCplText(raw);
}

function isPlaceholder(value: string): boolean {
  return !value || /^[-–—.:]+$/.test(value);
}

export function extractPatientNameFromInfCpl(infCpl: string | null | undefined): string | null {
  if (!infCpl) return null;
  const m = normalizeInfCplText(infCpl).match(/\(\s*Paciente\s+([^)]+?)\s*\)/i);
  if (!m?.[1]) return null;
  let name = cleanParenValue(m[1]);
  name = name.replace(/\s*[-–—]\s*ATEND\.?:?\s*\S+/i, '').trim();
  name = name.replace(/\s{2,}/g, ' ').trim();
  if (name.length < 3) return null;
  const tokens = name.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t));
  if (tokens.length < 2) return null;
  return name.toUpperCase();
}

export function extractConvenioNameFromInfCpl(infCpl: string | null | undefined): string | null {
  if (!infCpl) return null;
  const m = normalizeInfCplText(infCpl).match(/\(\s*Convenio\s+([^)]+?)\s*\)/i);
  if (!m?.[1]) return null;
  const name = cleanParenValue(m[1]);
  if (isPlaceholder(name)) return null;
  if (!/[A-Za-zÀ-ÿ]{2,}/.test(name)) return null;
  return name.toUpperCase();
}

export function extractDoctorNameFromInfCpl(infCpl: string | null | undefined): string | null {
  if (!infCpl) return null;
  const m = normalizeInfCplText(infCpl).match(/\(\s*M[eé]dico\s*[:\-]?\s*([^)]+?)\s*\)/i);
  if (!m?.[1]) return null;
  let name = cleanParenValue(m[1]);
  name = name.replace(/^[-–—.:]+\s*/, '').trim();
  if (isPlaceholder(name)) return null;
  const tokens = name.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]{2,}/.test(t));
  if (tokens.length < 1) return null;
  return name.toUpperCase();
}

export function extractPatientNameFromXml(xmlContent: string | null | undefined): string | null {
  return extractPatientNameFromInfCpl(extractInfCpl(xmlContent));
}

export function extractConvenioNameFromXml(xmlContent: string | null | undefined): string | null {
  return extractConvenioNameFromInfCpl(extractInfCpl(xmlContent));
}

export function extractDoctorNameFromXml(xmlContent: string | null | undefined): string | null {
  return extractDoctorNameFromInfCpl(extractInfCpl(xmlContent));
}
