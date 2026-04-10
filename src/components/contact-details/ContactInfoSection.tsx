'use client';

import { formatDocument } from '@/lib/modal-helpers';
import { validateIE } from '@/lib/ie-validation';
import type { ContactDetails, ContactFiscalData } from './contact-detail-types';

interface ContactInfoSectionProps {
  contact: ContactDetails;
  contactFiscal: ContactFiscalData | null;
}

export default function ContactInfoSection({ contact, contactFiscal }: ContactInfoSectionProps) {
  const ie = contact.stateRegistration;
  const ieResult = ie ? validateIE(ie, contactFiscal?.uf || contact.address?.state) : null;

  return (
    <div className="space-y-1.5 mb-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
        <span className="font-bold text-slate-800 dark:text-slate-200">{contact.name}</span>
        {contact.fantasyName && <span className="text-slate-400 dark:text-slate-500 text-[11px]">({contact.fantasyName})</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="font-mono">{formatDocument(contact.cnpj)}</span>
        {ie && (
          <span>
            IE {ie}
            {ieResult && (
              ieResult.valid
                ? <span className="text-emerald-500 ml-1 text-[10px]">OK</span>
                : <span className="text-amber-600 ml-1 text-[10px]" title={ieResult.message}>Irregular</span>
            )}
          </span>
        )}
        {contact.municipalRegistration && <span>IM {contact.municipalRegistration}</span>}
        {contactFiscal?.crtLabel && <span>{contactFiscal.crtLabel}</span>}
      </div>
    </div>
  );
}
