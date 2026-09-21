export const QL_MED_ISSUER = {
  razaoSocial: 'QL MED MATERIAIS HOSPITALARES LTDA',
  cnpj: '07832309000197',
  ie: '28.337.918-9',
  street: 'Rua Dr. Salomão Nahas',
  number: '44',
  district: 'Cachoeira II',
  city: 'Campo Grande',
  state: 'MS',
  zip: '79040100',
  phone: '6733263520',
  email: 'qlta@uol.com.br',
} as const;

export const QUOTE_CLOSING_CONTACTS = [
  { name: 'Flavio', email: 'flavio@qlmed.com.br' },
  { name: 'Daniele', email: 'daniele@qlmed.com.br' },
  { name: 'Marcelo', email: 'marcelo@qlmed.com.br' },
] as const;

export type QuoteIssuer = {
  razaoSocial: string;
  cnpj: string;
  ie: string;
  addressLine: string;
  phone: string;
  email: string;
};

function digits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

export function buildIssuer(input: {
  razaoSocial?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  street?: string | null;
  number?: string | null;
  district?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  email?: string | null;
}): QuoteIssuer {
  const cnpj = digits(input.cnpj) || QL_MED_ISSUER.cnpj;
  const razaoSocial = (input.razaoSocial || '').trim() || QL_MED_ISSUER.razaoSocial;
  const ie = (input.ie || '').trim() || QL_MED_ISSUER.ie;
  const street = (input.street || '').trim() || QL_MED_ISSUER.street;
  const number = (input.number || '').trim() || QL_MED_ISSUER.number;
  const district = (input.district || '').trim() || QL_MED_ISSUER.district;
  const city = (input.city || '').trim() || QL_MED_ISSUER.city;
  const state = (input.state || '').trim() || QL_MED_ISSUER.state;
  const phone = digits(input.phone) || QL_MED_ISSUER.phone;
  const email = (input.email || '').trim() || QL_MED_ISSUER.email;
  return {
    razaoSocial,
    cnpj,
    ie,
    addressLine: `${street}, ${number} - ${district} - ${city} - ${state}`,
    phone,
    email,
  };
}
