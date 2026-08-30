export const FIN_NFE_OPTIONS = [
  { value: '1', label: 'Normal' },
  { value: '2', label: 'Complementar' },
  { value: '3', label: 'Ajuste' },
  { value: '4', label: 'Devolução' },
] as const;

export const IND_PRES_OPTIONS = [
  { value: '1', label: 'Presencial' },
  { value: '2', label: 'Internet' },
  { value: '3', label: 'Teleatendimento' },
  { value: '4', label: 'Entrega a domicílio' },
  { value: '5', label: 'Presencial fora do estabelecimento' },
  { value: '9', label: 'Não presencial — outros' },
  { value: '0', label: 'Não se aplica' },
] as const;

export const MOD_FRETE_OPTIONS = [
  { value: '0', label: 'Contratação do emitente (CIF)' },
  { value: '1', label: 'Contratação do destinatário (FOB)' },
  { value: '2', label: 'Contratação de terceiros' },
  { value: '3', label: 'Transporte próprio do remetente' },
  { value: '4', label: 'Transporte próprio do destinatário' },
  { value: '9', label: 'Sem ocorrência de transporte' },
] as const;

export const TPAG_OPTIONS = [
  { value: '01', label: 'Dinheiro' },
  { value: '03', label: 'Cartão de crédito' },
  { value: '04', label: 'Cartão de débito' },
  { value: '15', label: 'Boleto bancário' },
  { value: '16', label: 'Depósito bancário' },
  { value: '17', label: 'PIX' },
  { value: '18', label: 'Transferência / carteira digital' },
  { value: '90', label: 'Sem pagamento' },
  { value: '99', label: 'Outros' },
] as const;
