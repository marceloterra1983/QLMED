/**
 * background-supervisor.ts — Gerenciador e supervisor profundo do ciclo de vida
 * das rotinas em segundo plano do QLMED.
 *
 * Centraliza o agendamento escalonado de inicialização (staggered start),
 * o registro unificado de rotinas, controle de cancelamento/desligamento (graceful shutdown)
 * e integração direta com o monitor de saúde (background-service-health).
 */

import { createLogger } from '@/lib/logger';
import {
  type BackgroundServiceName,
  markBackgroundServiceError,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';

const log = createLogger('background-supervisor');

export interface BackgroundServiceSpec {
  name: BackgroundServiceName;
  description: string;
  delayMs: number;
  start: () => Promise<void> | void;
  stop?: () => Promise<void> | void;
}

export interface SupervisorStatus {
  service: BackgroundServiceName;
  registered: boolean;
  started: boolean;
  delayMs: number;
}

export class BackgroundSupervisor {
  private specs = new Map<BackgroundServiceName, BackgroundServiceSpec>();
  private timers = new Map<BackgroundServiceName, NodeJS.Timeout>();
  private startedServices = new Set<BackgroundServiceName>();
  private isShuttingDown = false;

  public register(spec: BackgroundServiceSpec): this {
    this.specs.set(spec.name, spec);
    return this;
  }

  public startAll(): void {
    if (this.isShuttingDown) return;
    if (process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true') {
      log.info('Background services disabled via QLMED_DISABLE_BACKGROUND_SERVICES');
      return;
    }

    for (const [name, spec] of this.specs.entries()) {
      if (this.startedServices.has(name) || this.timers.has(name)) {
        continue;
      }

      const timer = setTimeout(async () => {
        this.timers.delete(name);
        if (this.isShuttingDown) return;

        try {
          markBackgroundServiceStarted(name);
          log.info({ service: name, delayMs: spec.delayMs }, 'Iniciando rotina de background');
          await spec.start();
          this.startedServices.add(name);
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          markBackgroundServiceError(name, errMsg);
          log.error({ service: name, err }, 'Falha ao iniciar rotina de background');
        }
      }, spec.delayMs);

      this.timers.set(name, timer);
    }
  }

  public async stopAll(): Promise<void> {
    this.isShuttingDown = true;

    for (const [name, timer] of this.timers.entries()) {
      clearTimeout(timer);
      this.timers.delete(name);
      log.info({ service: name }, 'Timer de background cancelado');
    }

    for (const [name, spec] of this.specs.entries()) {
      if (this.startedServices.has(name) && spec.stop) {
        try {
          await spec.stop();
          log.info({ service: name }, 'Rotina de background encerrada');
        } catch (err) {
          log.warn({ service: name, err }, 'Erro ao encerrar rotina de background');
        }
      }
    }

    this.startedServices.clear();
  }

  public getRegisteredServices(): SupervisorStatus[] {
    return Array.from(this.specs.values()).map((spec) => ({
      service: spec.name,
      registered: true,
      started: this.startedServices.has(spec.name),
      delayMs: spec.delayMs,
    }));
  }

  public __resetForTests(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.startedServices.clear();
    this.specs.clear();
    this.isShuttingDown = false;
  }
}

const globalForSupervisor = globalThis as typeof globalThis & {
  __qlmedBackgroundSupervisor?: BackgroundSupervisor;
};

export const backgroundSupervisor: BackgroundSupervisor =
  (globalForSupervisor.__qlmedBackgroundSupervisor ??= new BackgroundSupervisor());
