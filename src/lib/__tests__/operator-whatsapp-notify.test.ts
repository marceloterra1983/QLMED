import { describe, expect, it, vi } from 'vitest';
import {
  buildOperatorWhatsAppCaption,
  isWithinOperatorNotifyWindow,
  notifyOperatorAuthorization,
  resolveOperatorWhatsAppTarget,
} from '@/lib/operator-whatsapp-notify';

describe('operator-whatsapp-notify', () => {
  it('buildOperatorWhatsAppCaption formata campos de autorização com CRM e hospital', () => {
    const caption = buildOperatorWhatsAppCaption('CASSEMS', {
      oficioNumber: '123/2026',
      patientName: 'Maria Silva',
      patientRegistry: 'REG-999',
      doctorName: 'Dr. João',
      doctorCrm: '1234-MS',
      hospitalName: 'Hospital Central',
    });

    expect(caption).toContain('Autorização CASSEMS — Ofício 123/2026');
    expect(caption).toContain('Paciente: Maria Silva');
    expect(caption).toContain('Matrícula: REG-999');
    expect(caption).toContain('Médico: Dr. João (CRM 1234-MS)');
    expect(caption).toContain('Local de entrega: Hospital Central');
  });

  it('buildOperatorWhatsAppCaption omite linhas opcionais e exibe não identificado para hospital vazio', () => {
    const caption = buildOperatorWhatsAppCaption('IMPCG', {
      oficioNumber: '456/2026',
      patientName: 'Carlos Santos',
      patientRegistry: null,
      doctorName: null,
      doctorCrm: null,
      hospitalName: null,
    });

    expect(caption).toContain('Autorização IMPCG — Ofício 456/2026');
    expect(caption).toContain('Paciente: Carlos Santos');
    expect(caption).not.toContain('Matrícula');
    expect(caption).not.toContain('Médico');
    expect(caption).toContain('Local de entrega: não identificado no ofício');
  });

  it('isWithinOperatorNotifyWindow calcula corretamente limites de idade', () => {
    const now = new Date('2026-09-06T12:00:00Z');
    const recent = new Date('2026-09-06T11:00:00Z');
    const old = new Date('2026-09-05T10:00:00Z');
    const maxAgeMs = 2 * 3600 * 1000; // 2 horas

    expect(isWithinOperatorNotifyWindow(recent, maxAgeMs, now)).toBe(true);
    expect(isWithinOperatorNotifyWindow(old, maxAgeMs, now)).toBe(false);
  });

  it('resolveOperatorWhatsAppTarget retorna null quando desabilitado ou sem grupo/config', () => {
    expect(
      resolveOperatorWhatsAppTarget({
        isEnabled: false,
        groupRaw: '12345@g.us',
        config: { baseUrl: 'u', instance: 'i', apiKey: 'k' },
      }),
    ).toBeNull();

    expect(
      resolveOperatorWhatsAppTarget({
        isEnabled: true,
        groupRaw: 'invalido',
        config: { baseUrl: 'u', instance: 'i', apiKey: 'k' },
      }),
    ).toBeNull();

    expect(
      resolveOperatorWhatsAppTarget({
        isEnabled: true,
        groupRaw: '12345@g.us',
        config: null,
      }),
    ).toBeNull();
  });

  it('notifyOperatorAuthorization envia documento e retorna sent: true', async () => {
    const sendDocument = vi.fn(async () => ({ messageId: 'msg-abc' }));
    const target = {
      jid: '12036304@g.us',
      port: { sendDocument },
    };

    const result = await notifyOperatorAuthorization({
      operatorName: 'CASSEMS',
      target,
      fields: {
        oficioNumber: '789',
        patientName: 'Ana',
        patientRegistry: null,
        doctorName: null,
        doctorCrm: null,
        hospitalName: null,
      },
      fileName: 'oficio.pdf',
      content: Buffer.from('pdf-content'),
    });

    expect(result).toEqual({ sent: true, messageId: 'msg-abc' });
    expect(sendDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        jid: '12036304@g.us',
        fileName: 'oficio.pdf',
      }),
    );
  });

  it('notifyOperatorAuthorization isola exceção e retorna sent: false sem explodir', async () => {
    const sendDocument = vi.fn(async () => {
      throw new Error('Evolution network failure');
    });
    const target = {
      jid: '12036304@g.us',
      port: { sendDocument },
    };

    const result = await notifyOperatorAuthorization({
      operatorName: 'CASSEMS',
      target,
      fields: {
        oficioNumber: '789',
        patientName: 'Ana',
        patientRegistry: null,
        doctorName: null,
        doctorCrm: null,
        hospitalName: null,
      },
      fileName: 'oficio.pdf',
      content: Buffer.from('pdf-content'),
    });

    expect(result).toEqual({ sent: false, messageId: null });
  });
});
