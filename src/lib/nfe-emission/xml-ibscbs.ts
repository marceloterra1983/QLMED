import { Decimal } from '@prisma/client-runtime-utils';
import { formatMoneyDecimal } from '@/lib/money';
import {
  IBS_CCLASS_TRIB,
  IBS_CST,
  IBS_P_CBS,
  IBS_P_MUN,
  IBS_P_RED,
  IBS_P_UF,
} from './issued-defaults';

export type IbsItem = {
  vBc: string;
  vIbsUf: string;
  vIbsMun: string;
  vIbs: string;
  vCbs: string;
  pAliqEfetUf: string;
  pAliqEfetMun: string;
  pAliqEfetCbs: string;
};

function money(value: Decimal): string {
  return formatMoneyDecimal(value);
}

function pct(value: Decimal): string {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Alíquota-teste 2026 com redução 60% (Anexo IV / cClassTrib 200030). */
export function computeIbsItem(vBcRaw: string): IbsItem {
  const vBc = new Decimal(vBcRaw).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const factor = new Decimal(1).minus(new Decimal(IBS_P_RED).div(100));
  const efetUf = new Decimal(IBS_P_UF).mul(factor);
  const efetMun = new Decimal(IBS_P_MUN).mul(factor);
  const efetCbs = new Decimal(IBS_P_CBS).mul(factor);
  const vIbsUf = vBc.mul(efetUf).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const vIbsMun = vBc.mul(efetMun).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const vCbs = vBc.mul(efetCbs).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const vIbs = vIbsUf.plus(vIbsMun).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return {
    vBc: money(vBc),
    vIbsUf: money(vIbsUf),
    vIbsMun: money(vIbsMun),
    vIbs: money(vIbs),
    vCbs: money(vCbs),
    pAliqEfetUf: pct(efetUf),
    pAliqEfetMun: pct(efetMun),
    pAliqEfetCbs: pct(efetCbs),
  };
}

export function ibsCbsItemXml(row: IbsItem): string {
  const red = (efet: string) =>
    `<gRed><pRedAliq>${IBS_P_RED}</pRedAliq><pAliqEfet>${efet}</pAliqEfet></gRed>`;
  return (
    `<IBSCBS><CST>${IBS_CST}</CST><cClassTrib>${IBS_CCLASS_TRIB}</cClassTrib>`
    + `<gIBSCBS><vBC>${row.vBc}</vBC>`
    + `<gIBSUF><pIBSUF>${IBS_P_UF}</pIBSUF>${red(row.pAliqEfetUf)}<vIBSUF>${row.vIbsUf}</vIBSUF></gIBSUF>`
    + `<gIBSMun><pIBSMun>${IBS_P_MUN}</pIBSMun>${red(row.pAliqEfetMun)}<vIBSMun>${row.vIbsMun}</vIBSMun></gIBSMun>`
    + `<vIBS>${row.vIbs}</vIBS>`
    + `<gCBS><pCBS>${IBS_P_CBS}</pCBS>${red(row.pAliqEfetCbs)}<vCBS>${row.vCbs}</vCBS></gCBS>`
    + `</gIBSCBS></IBSCBS>`
  );
}

export function ibsCbsTotXml(rows: IbsItem[]): string {
  if (rows.length === 0) return '';
  const vBc = money(rows.reduce((s, r) => s.plus(r.vBc), new Decimal(0)));
  const vIbsUf = money(rows.reduce((s, r) => s.plus(r.vIbsUf), new Decimal(0)));
  const vIbsMun = money(rows.reduce((s, r) => s.plus(r.vIbsMun), new Decimal(0)));
  const vIbs = money(rows.reduce((s, r) => s.plus(r.vIbs), new Decimal(0)));
  const vCbs = money(rows.reduce((s, r) => s.plus(r.vCbs), new Decimal(0)));
  return (
    `<IBSCBSTot><vBCIBSCBS>${vBc}</vBCIBSCBS>`
    + `<gIBS><gIBSUF><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSUF>${vIbsUf}</vIBSUF></gIBSUF>`
    + `<gIBSMun><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vIBSMun>${vIbsMun}</vIBSMun></gIBSMun>`
    + `<vIBS>${vIbs}</vIBS><vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gIBS>`
    + `<gCBS><vDif>0.00</vDif><vDevTrib>0.00</vDevTrib><vCBS>${vCbs}</vCBS>`
    + `<vCredPres>0.00</vCredPres><vCredPresCondSus>0.00</vCredPresCondSus></gCBS>`
    + `</IBSCBSTot>`
  );
}
