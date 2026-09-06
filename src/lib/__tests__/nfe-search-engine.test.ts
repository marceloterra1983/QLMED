import { describe, expect, it } from 'vitest';
import {
  buildInvoiceSearchConditions,
  expandAccentVariants,
  tokenizeInvoiceSearch,
} from '@/lib/nfe/search-engine';

describe('nfe search-engine', () => {
  describe('expandAccentVariants', () => {
    it('expands unaccented words to canonical accented Portuguese variants', () => {
      const variants = expandAccentVariants('sao');
      expect(variants).toContain('sao');
      expect(variants).toContain('são');

      const joaoVariants = expandAccentVariants('joao');
      expect(joaoVariants).toContain('joão');

      const clinicaVariants = expandAccentVariants('clinica');
      expect(clinicaVariants).toContain('clínica');

      const medicoVariants = expandAccentVariants('medico');
      expect(medicoVariants).toContain('médico');

      const convenioVariants = expandAccentVariants('convenio');
      expect(convenioVariants).toContain('convênio');
    });

    it('preserves typed accents and adds unaccented variant', () => {
      const variants = expandAccentVariants('São');
      expect(variants).toContain('São');
      expect(variants).toContain('sao');
      expect(variants).toContain('são');
    });

    it('handles Portuguese -ao and -coes suffix rules', () => {
      const variants = expandAccentVariants('fundacao');
      expect(variants).toContain('fundação');

      const actionVariants = expandAccentVariants('autorizacoes');
      expect(actionVariants).toContain('autorizações');
    });
  });

  describe('tokenizeInvoiceSearch', () => {
    it('identifies 44-digit access key even with spaces and dashes', () => {
      const keySpaced = '5026 0807 8323 0900 0197 5500 2000 0650 5310 0464 0320';
      const parsed = tokenizeInvoiceSearch(keySpaced);
      expect(parsed.exactAccessKey).toBe('50260807832309000197550020000650531004640320');
      expect(parsed.tokens).toEqual([]);
    });

    it('identifies formatted CNPJ', () => {
      const parsed = tokenizeInvoiceSearch('03.315.918/0001-18');
      expect(parsed.exactCnpj).toBe('03315918000118');
      expect(parsed.tokens).toEqual([]);
    });

    it('identifies unformatted CNPJ', () => {
      const parsed = tokenizeInvoiceSearch('03315918000118');
      expect(parsed.exactCnpj).toBe('03315918000118');
      expect(parsed.tokens).toEqual([]);
    });

    it('identifies formatted CPF', () => {
      const parsed = tokenizeInvoiceSearch('123.456.789-00');
      expect(parsed.exactCpf).toBe('12345678900');
    });

    it('identifies currency amounts', () => {
      expect(tokenizeInvoiceSearch('4.760,00').totalValueAmount).toBe(4760);
      expect(tokenizeInvoiceSearch('R$ 1.250,50').totalValueAmount).toBe(1250.5);
      expect(tokenizeInvoiceSearch('350,00').totalValueAmount).toBe(350);
    });

    it('strips noise stopwords like NF, NF-e, Dr., Dra.', () => {
      const parsedNfe = tokenizeInvoiceSearch('NF-e 65053');
      expect(parsedNfe.tokens).toEqual(['65053']);

      const parsedDoctor = tokenizeInvoiceSearch('Dr. Marcos Vinicius');
      expect(parsedDoctor.tokens).toEqual(['Marcos', 'Vinicius']);

      const parsedOnlyStopword = tokenizeInvoiceSearch('NF');
      expect(parsedOnlyStopword.tokens).toEqual(['NF']);
    });
  });

  describe('buildInvoiceSearchConditions', () => {
    it('builds direct accessKey query when exact key is provided', () => {
      const criteria = tokenizeInvoiceSearch('50260807832309000197550020000650531004640320');
      const conditions = buildInvoiceSearchConditions(criteria);
      expect(conditions).toEqual({ accessKey: '50260807832309000197550020000650531004640320' });
    });

    it('builds direct CNPJ query across recipient and sender', () => {
      const criteria = tokenizeInvoiceSearch('03.315.918/0001-18');
      const conditions = buildInvoiceSearchConditions(criteria);
      expect(conditions).toEqual({
        OR: [
          { recipientCnpj: '03315918000118' },
          { senderCnpj: '03315918000118' },
        ],
      });
    });

    it('generates multi-field conditions with accent variants, number leading zeros, and xmlContent', () => {
      const criteria = tokenizeInvoiceSearch('São 065053');
      const conditions = buildInvoiceSearchConditions(criteria, { searchXmlContent: true }) as {
        AND: Array<{ OR: Record<string, unknown>[] }>;
      };

      expect(conditions.AND).toBeDefined();
      expect(conditions.AND).toHaveLength(2);

      // Token "São": variants "São", "sao", "são"
      const saoOr = conditions.AND[0].OR;
      const recipientMatches = saoOr.filter((item) => 'recipientName' in item);
      expect(recipientMatches.length).toBeGreaterThanOrEqual(2);

      // Token "065053": should include stripped "65053" in number
      const numberOr = conditions.AND[1].OR;
      const strippedNumberMatch = numberOr.find(
        (item) => (item.number as { contains?: string })?.contains === '65053',
      );
      expect(strippedNumberMatch).toBeDefined();

      // Should include xmlContent for product searches
      const xmlMatch = saoOr.find((item) => 'xmlContent' in item);
      expect(xmlMatch).toBeDefined();
    });
  });
});
