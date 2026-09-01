/**
 * Label visível do destinatário na Nova NF-e.
 * ContactNickname.shortName (apelido) vence só se existir texto;
 * senão razão social. Não inventa apelido. Payload/XML continua
 * com recipientName — este helper é só UI.
 */
export function recipientDisplayName(
  name: string | null | undefined,
  shortName?: string | null,
): string {
  const nick = (shortName ?? '').trim();
  if (nick) return nick;
  return (name ?? '').trim();
}

export type RecipientNicknameRow = {
  cnpj: string;
  shortName?: string | null;
};

/**
 * Anexa shortName por CNPJ (dígitos). shortName vazio/whitespace
 * não entra — o caller trata como ausência.
 */
export function applyRecipientShortNames<T extends { cnpj: string }>(
  customers: T[],
  nicknames: ReadonlyArray<RecipientNicknameRow>,
): Array<T & { shortName?: string }> {
  const byDigits = new Map<string, string>();
  for (const row of nicknames) {
    const nick = (row.shortName ?? '').trim();
    const key = row.cnpj.replace(/\D/g, '');
    if (!nick || !key) continue;
    byDigits.set(key, nick);
  }
  return customers.map((row) => {
    const shortName = byDigits.get(row.cnpj.replace(/\D/g, ''));
    return shortName ? { ...row, shortName } : row;
  });
}
