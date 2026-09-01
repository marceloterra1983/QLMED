import type { CnpjResult } from '@/lib/cnpj-result';
import { checkCnaeMismatch } from './cnae-mismatch';

export type ContactKind = 'customer' | 'supplier';

/**
 * Tudo que difere entre a visão de cliente e a de fornecedor.
 * As classes de cor vêm inteiras (nunca `bg-${accent}-500`): o Tailwind faz
 * purge estático e uma classe montada em runtime não sobrevive ao build.
 */
export interface ContactKindConfig {
  /** rota de detalhes; a resposta traz o contato sob a chave `responseKey` */
  detailsPath: string;
  responseKey: 'customer' | 'supplier';
  noun: string;

  headerIcon: string;
  headerIconClass: string;
  headerAvatarClass: string;
  emptyIcon: string;
  titleFallback: string;

  registrationSubtitle: string;
  shortNamePlaceholder: string;
  shortNameIconClass: string;
  shortNameButtonClass: string;
  shortNameInputClass: string;
  addressAccent: string;

  generalSubtitle: string;
  statLabels: [string, string, string, string, string];
  firstStatColor: string;

  priceTableSubtitle: string;
  sortAccentColor: string;

  /** CFOP tags que contam como nota "principal"; o resto vira Movimentações */
  primaryInvoiceTags: string[];
  invoicesSubtitle: string;
  invoicesEmptyLabel: string;

  /** só o fornecedor cruza CNAE com tipos de produto */
  fiscalWarning?: (cnpjData: CnpjResult, productTypes: string[]) => string | null;

  priceModalEmptyIcon: string;
  priceDetailPriceLabel: string;
  priceDetailDateLabel: string;
  priceColumnDateLabel: string;
}

export const CONTACT_KINDS: Record<ContactKind, ContactKindConfig> = {
  customer: {
    detailsPath: '/api/customers/details',
    responseKey: 'customer',
    noun: 'cliente',

    headerIcon: 'person',
    headerIconClass: 'text-primary dark:text-blue-400',
    headerAvatarClass:
      'bg-gradient-to-br from-primary/20 to-primary/5 dark:from-primary/30 dark:to-primary/10 ring-primary/20 dark:ring-primary/30',
    emptyIcon: 'person_off',
    titleFallback: 'Visualizar cliente',

    registrationSubtitle: 'Dados fiscais e endereço do destinatário',
    shortNamePlaceholder: 'Nome abreviado (ex: Farmácia ABC)...',
    shortNameIconClass: 'text-indigo-500',
    shortNameButtonClass: 'bg-indigo-500 hover:bg-indigo-600',
    shortNameInputClass: 'focus:ring-indigo-500/40 focus:border-indigo-500',
    addressAccent: 'indigo',

    generalSubtitle: 'Resumo consolidado das vendas',
    statLabels: ['NF-e emitidas', 'Total vendido', 'Itens vendidos', 'Produtos vendidos', 'Última venda'],
    firstStatColor: 'primary',

    priceTableSubtitle: 'Histórico por item com base nas NF-e emitidas',
    sortAccentColor: 'text-primary dark:text-blue-400',

    primaryInvoiceTags: ['Venda', 'Bonificação'],
    invoicesSubtitle: 'Vendas e bonificações',
    invoicesEmptyLabel: 'Nenhuma nota de venda ou bonificação encontrada',

    priceModalEmptyIcon: 'group',
    priceDetailPriceLabel: 'Último Preço de Venda',
    priceDetailDateLabel: 'Última Venda',
    priceColumnDateLabel: 'Última Venda',
  },

  supplier: {
    detailsPath: '/api/suppliers/details',
    responseKey: 'supplier',
    noun: 'fornecedor',

    headerIcon: 'local_shipping',
    headerIconClass: 'text-orange-500',
    headerAvatarClass:
      'bg-gradient-to-br from-orange-500/20 to-orange-500/5 dark:from-orange-500/30 dark:to-orange-500/10 ring-orange-500/20 dark:ring-orange-500/30',
    emptyIcon: 'storefront',
    titleFallback: 'Visualizar fornecedor',

    registrationSubtitle: 'Dados fiscais e endereço do emitente',
    shortNamePlaceholder: 'Nome abreviado (ex: Distribuidora XYZ)...',
    shortNameIconClass: 'text-orange-500',
    shortNameButtonClass: 'bg-orange-500 hover:bg-orange-600',
    shortNameInputClass: 'focus:ring-orange-500/40 focus:border-orange-500',
    addressAccent: 'orange',

    generalSubtitle: 'Resumo consolidado das compras',
    statLabels: ['NF-e recebidas', 'Total comprado', 'Itens comprados', 'Produtos comprados', 'Última compra'],
    firstStatColor: 'orange',

    priceTableSubtitle: 'Histórico por item com base nas NF-e recebidas',
    sortAccentColor: 'text-orange-500',

    primaryInvoiceTags: ['Compra', 'Compra Importação', 'Bonificação'],
    invoicesSubtitle: 'Compras e bonificações',
    invoicesEmptyLabel: 'Nenhuma nota fiscal de compra encontrada',

    fiscalWarning: (cnpjData, productTypes) =>
      cnpjData.cnaePrincipal
        ? checkCnaeMismatch(cnpjData.cnaePrincipal.codigo, cnpjData.cnaePrincipal.descricao, productTypes)
        : null,

    priceModalEmptyIcon: 'storefront',
    priceDetailPriceLabel: 'Último Preço de Compra',
    priceDetailDateLabel: 'Última Compra',
    priceColumnDateLabel: 'Última Compra',
  },
};
