import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { getCfopTagByCode } from '@/lib/cfop';

/**
 * GET /api/products/history?code=XXX&unit=YYY&direction=received|issued
 * Returns purchase or sales history for a product (all invoices that contain it).
 */
export async function GET(req: Request) {
  try {
    const userId = await requireAuth().catch(() => null);
    if (!userId) return unauthorizedResponse();

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code')?.trim();
    const unit = searchParams.get('unit')?.trim();

    const direction = searchParams.get('direction')?.trim() || 'received';
    if (direction !== 'received' && direction !== 'issued') {
      return NextResponse.json({ error: 'direction inválido' }, { status: 400 });
    }

    const filterMode = searchParams.get('filter')?.trim() || 'normal'; // 'normal' | 'consignment'
    const description = searchParams.get('description')?.trim();

    if (!code && !description) {
      return NextResponse.json({ error: 'code ou description é obrigatório' }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ history: [], total: 0 });
    }
    const escapedCode = code.replace(/[%_\\]/g, '\\$&');
    const matchMode: 'cProd' | 'issued' = direction === 'issued' ? 'issued' : 'cProd';

    // For issued (sales) invoices, product codes differ from received (purchase) invoices.
    // Issued invoices use internal numeric codes (e.g. "004864") while received use supplier
    // codes (e.g. "NXG40013"). We do a two-pass approach:
    // 1. Find invoices where xProd contains the supplier code → discover internal cProd(s)
    // 2. Search again by those internal cProd(s) to find ALL issued invoices for the product
    let likePatterns: string[] = [];
    let internalCodes: Set<string> = new Set();

    if (matchMode === 'issued') {
      // First pass: find by supplier code in xProd
      likePatterns.push(`%${escapedCode}%`);
    } else {
      likePatterns.push(`%<cProd>${escapedCode}</cProd>%`);
    }

    const fetchInvoices = async (pattern: string) => {
      return prisma.$queryRawUnsafe<Array<{
        id: string;
        number: string | null;
        issueDate: Date | null;
        senderName: string | null;
        senderCnpj: string | null;
        recipientName: string | null;
        recipientCnpj: string | null;
        xmlContent: string;
      }>>(
        `SELECT id, number, "issueDate", "senderName", "senderCnpj", "recipientName", "recipientCnpj", "xmlContent"
         FROM "Invoice"
         WHERE "companyId" = $1
           AND type = 'NFE'
           AND direction = '${direction}'
           AND "xmlContent" LIKE $2
         ORDER BY "issueDate" DESC
         LIMIT 200`,
        company.id,
        pattern,
      );
    };

    // First pass
    let invoices = await fetchInvoices(likePatterns[0]);

    // For issued: discover internal cProd codes from first-pass results
    if (matchMode === 'issued') {
      const detRegexDiscover = /<det\b[^>]*>[\s\S]*?<\/det>/gi;
      const tagValLocal = (xml: string, tag: string): string => {
        const m = xml.match(new RegExp(`<${tag}>\\s*([^<]*)\\s*</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };
      const codeUpper = code.toUpperCase();
      for (const inv of invoices) {
        if (!inv.xmlContent) continue;
        let m: RegExpExecArray | null;
        detRegexDiscover.lastIndex = 0;
        while ((m = detRegexDiscover.exec(inv.xmlContent)) !== null) {
          const det = m[0];
          const xProd = tagValLocal(det, 'xProd').toUpperCase();
          const cProd = tagValLocal(det, 'cProd');
          if (xProd.startsWith(codeUpper + ' ') || xProd.startsWith(codeUpper + '-')) {
            if (cProd && cProd.toUpperCase() !== codeUpper) {
              internalCodes.add(cProd);
            }
          }
        }
      }

      // Second pass: fetch by each internal cProd code (if any found)
      if (internalCodes.size > 0) {
        const seenIds = new Set(invoices.map(i => i.id));
        for (const ic of Array.from(internalCodes)) {
          const escapedIc = ic.replace(/[%_\\]/g, '\\$&');
          const moreInvoices = await fetchInvoices(`%<cProd>${escapedIc}</cProd>%`);
          for (const inv of moreInvoices) {
            if (!seenIds.has(inv.id)) {
              seenIds.add(inv.id);
              invoices.push(inv);
            }
          }
        }
        // Re-sort by issueDate DESC
        invoices.sort((a, b) => (b.issueDate?.getTime() || 0) - (a.issueDate?.getTime() || 0));
      }
    }

    // Extract item details from each invoice XML via regex
    const history: Array<{
      invoiceId: string;
      invoiceNumber: string | null;
      issueDate: string | null;
      supplierName: string | null;
      customerName: string | null;
      quantity: number;
      unitPrice: number;
      totalValue: number;
      batch: string | null;
      expiry: string | null;
      fabrication: string | null;
    }> = [];

    const detRegex = /<det\b[^>]*>[\s\S]*?<\/det>/gi;
    const tagVal = (xml: string, tag: string): string => {
      const m = xml.match(new RegExp(`<${tag}>\\s*([^<]*)\\s*</${tag}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const codeUpper = code.toUpperCase();

    for (const inv of invoices) {
      if (!inv.xmlContent) continue;
      let match: RegExpExecArray | null;
      detRegex.lastIndex = 0;

      while ((match = detRegex.exec(inv.xmlContent)) !== null) {
        const det = match[0];
        if (matchMode === 'cProd') {
          const cProd = tagVal(det, 'cProd');
          if (cProd !== code) continue;
        } else {
          // Match by: supplier code in xProd prefix, OR internal cProd discovered earlier
          const xProd = tagVal(det, 'xProd').toUpperCase();
          const cProd = tagVal(det, 'cProd');
          const matchesSupplierCode = xProd.startsWith(codeUpper + ' ') || xProd.startsWith(codeUpper + '-');
          const matchesInternalCode = internalCodes.has(cProd);
          if (!matchesSupplierCode && !matchesInternalCode && cProd.toUpperCase() !== codeUpper) continue;
        }

        const cfop = tagVal(det, 'CFOP');
        const tag = getCfopTagByCode(cfop);

        // "consignment" mode: only include consignment CFOPs
        if (filterMode === 'consignment') {
          if (tag !== 'Consignação') continue;
        } else {
          // Normal mode: exclude non-sale/non-purchase CFOPs
          const excludeTags = ['Consignação', 'Dev. Consig.', 'Dev. Venda', 'Dev. Compra', 'Comodato', 'Ret. Comodato', 'Conserto', 'Ret. Demonstração', 'Ret. Ativo', 'Dev. Ativo Terceiro', 'Outras Entradas'];
          if (tag && excludeTags.includes(tag)) continue;
        }

        // For issued, exclude incoming CFOPs (start with 1 or 2)
        if (matchMode === 'issued') {
          if (cfop.startsWith('1') || cfop.startsWith('2')) continue;
        }

        // If unit filter provided, check it
        if (unit) {
          const uCom = tagVal(det, 'uCom');
          if (uCom.toUpperCase() !== unit.toUpperCase()) continue;
        }

        const qCom = parseFloat(tagVal(det, 'qCom')) || 0;
        const vUnCom = parseFloat(tagVal(det, 'vUnCom')) || 0;
        const vProd = parseFloat(tagVal(det, 'vProd')) || 0;

        // Extract batch/expiry from <rastro> blocks (may be multiple per item)
        const batches: string[] = [];
        const expiries: string[] = [];
        const fabrications: string[] = [];

        const rastroRegex = /<rastro>([\s\S]*?)<\/rastro>/gi;
        let rastroMatch: RegExpExecArray | null;
        while ((rastroMatch = rastroRegex.exec(det)) !== null) {
          const r = rastroMatch[1];
          const lot = tagVal(r, 'nLote');
          const val = tagVal(r, 'dVal');
          const fab = tagVal(r, 'dFab');
          if (lot) batches.push(lot);
          if (val) expiries.push(val);
          if (fab) fabrications.push(fab);
        }

        // Also try <med> block (older format)
        const medMatch = det.match(/<med>([\s\S]*?)<\/med>/i);
        if (medMatch) {
          const m = medMatch[1];
          const lot = tagVal(m, 'nLote') || tagVal(m, 'nLot');
          const val = tagVal(m, 'dVal');
          if (lot && !batches.includes(lot)) batches.push(lot);
          if (val && !expiries.includes(val)) expiries.push(val);
        }

        // Fallback: extract lot/series/expiry/fabrication from product description
        if (batches.length === 0 || expiries.length === 0) {
          const desc = tagVal(det, 'xProd');
          if (desc) {
            // Lote/LT patterns:
            // "Lotes: (2508024 - ..." | "LOTE:441125" | "-LT:2511121301-" | "Numero Serie : PWH005702"
            if (batches.length === 0) {
              const lotPatterns = [
                /(?:Lotes?|LT)\s*[.:]\s*\(?([A-Za-z0-9]+)/i,
                /Numero\s+Serie\s*:\s*([A-Za-z0-9]+)/i,
                /(?:^|\s)(?:CS|ES)\s+LOTE\s*:\s*([A-Za-z0-9]+)/i,
              ];
              for (const pat of lotPatterns) {
                const m = desc.match(pat);
                if (m) { batches.push(m[1].trim()); break; }
              }
            }
            // Validade patterns:
            // "Val:07/08/2030" | "-VAL:31/12/2099" | "Val.: 01/11/2026"
            if (expiries.length === 0) {
              const valMatch = desc.match(/Val[.:]?\s*(\d{2}\/\d{2}\/\d{4})/i)
                || desc.match(/Val[.:]?\s*(\d{4}-\d{2}-\d{2})/i);
              if (valMatch) expiries.push(valMatch[1]);
            }
            // Fabricação patterns:
            // "Fab:08/08/2025" | "-FAB:19/06/2024"
            if (fabrications.length === 0) {
              const fabMatch = desc.match(/Fab[.:]?\s*(\d{2}\/\d{2}\/\d{4})/i)
                || desc.match(/Fab[.:]?\s*(\d{4}-\d{2}-\d{2})/i);
              if (fabMatch) fabrications.push(fabMatch[1]);
            }
          }
        }

        history.push({
          invoiceId: inv.id,
          invoiceNumber: inv.number,
          issueDate: inv.issueDate?.toISOString() || null,
          supplierName: direction === 'received' ? inv.senderName : null,
          customerName: direction === 'issued' ? inv.recipientName : null,
          quantity: qCom,
          unitPrice: vUnCom,
          totalValue: vProd,
          batch: batches.map(b => b.replace(/[-\s]+$/, '').trim()).filter(Boolean).join(', ') || null,
          expiry: expiries.length > 0 ? expiries[expiries.length - 1] : null,
          fabrication: fabrications.length > 0 ? fabrications[0] : null,
        });
      }
    }

    return NextResponse.json({ history, total: history.length });
  } catch (e) {
    console.error('products/history error', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
