/**
 * Validate Inscrição Estadual format by UF.
 * Returns whether the IE matches the expected format for the given state.
 */

export interface IeValidationResult {
  valid: boolean;
  message?: string;
}

// IE format rules by UF — regex patterns for valid IE numbers
const IE_RULES: Record<string, { regex: RegExp; description: string }> = {
  AC: { regex: /^01\d{11}$/, description: '13 digitos, iniciando com 01' },
  AL: { regex: /^24\d{7}$/, description: '9 digitos, iniciando com 24' },
  AM: { regex: /^\d{9}$/, description: '9 digitos' },
  AP: { regex: /^03\d{7}$/, description: '9 digitos, iniciando com 03' },
  BA: { regex: /^\d{8,9}$/, description: '8 ou 9 digitos' },
  CE: { regex: /^\d{9}$/, description: '9 digitos' },
  DF: { regex: /^07\d{11}$/, description: '13 digitos, iniciando com 07' },
  ES: { regex: /^\d{9}$/, description: '9 digitos' },
  GO: { regex: /^(10|11|15|20|29)\d{7}$/, description: '9 digitos' },
  MA: { regex: /^12\d{7}$/, description: '9 digitos, iniciando com 12' },
  MG: { regex: /^\d{13}$/, description: '13 digitos' },
  MS: { regex: /^28\d{7}$/, description: '9 digitos, iniciando com 28' },
  MT: { regex: /^\d{11}$/, description: '11 digitos' },
  PA: { regex: /^15\d{7}$/, description: '9 digitos, iniciando com 15' },
  PB: { regex: /^\d{9}$/, description: '9 digitos' },
  PE: { regex: /^\d{9}$|^\d{14}$/, description: '9 ou 14 digitos' },
  PI: { regex: /^\d{9}$/, description: '9 digitos' },
  PR: { regex: /^\d{10}$/, description: '10 digitos' },
  RJ: { regex: /^\d{8}$/, description: '8 digitos' },
  RN: { regex: /^20\d{7,8}$/, description: '9 ou 10 digitos, iniciando com 20' },
  RO: { regex: /^\d{14}$/, description: '14 digitos' },
  RR: { regex: /^24\d{6}$/, description: '8 digitos, iniciando com 24' },
  RS: { regex: /^\d{10}$/, description: '10 digitos' },
  SC: { regex: /^\d{9}$/, description: '9 digitos' },
  SE: { regex: /^\d{9}$/, description: '9 digitos' },
  SP: { regex: /^\d{12}$|^P\d{12}$/, description: '12 digitos (ou P + 12 para produtor rural)' },
  TO: { regex: /^\d{11}$/, description: '11 digitos' },
};

/**
 * Validate an IE number against the expected format for a given UF.
 */
export function validateIE(ie: string | null | undefined, uf: string | null | undefined): IeValidationResult {
  if (!ie || !uf) return { valid: true }; // Can't validate without both

  const cleanIe = ie.replace(/[\.\-\/\s]/g, '').toUpperCase();
  const cleanUf = uf.trim().toUpperCase();

  // ISENTO is always valid
  if (cleanIe === 'ISENTO' || cleanIe === 'ISENTA') {
    return { valid: true };
  }

  const rule = IE_RULES[cleanUf];
  if (!rule) {
    return { valid: true, message: `UF ${cleanUf} desconhecida` };
  }

  if (rule.regex.test(cleanIe)) {
    return { valid: true };
  }

  return {
    valid: false,
    message: `IE invalida para ${cleanUf}: esperado ${rule.description}`,
  };
}
