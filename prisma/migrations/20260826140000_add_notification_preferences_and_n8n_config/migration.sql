-- Migration única declarada na janela de produção.
-- Funde 20260826140000_add_user_notification_preferences (SPEC-010) e
-- 20260826150000_add_n8n_integration_config (SPEC-011): o portão
-- verify-production-migration-window.cjs aceita exatamente UMA migration
-- pendente, nomeada e com SHA declarado. Nenhuma das duas foi aplicada em
-- banco algum, então fundi-las é seguro e preserva a atomicidade que o
-- portão existe para garantir.

-- ========== SPEC-010: preferências de notificação ==========
-- CreateTable
CREATE TABLE "UserNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" "NotificationEventType" NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotificationPreference_eventType_enabled_idx" ON "UserNotificationPreference"("eventType", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "UserNotificationPreference_userId_eventType_key" ON "UserNotificationPreference"("userId", "eventType");

-- AddForeignKey
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ========== SPEC-011: configuração da integração n8n ==========
-- CreateTable
CREATE TABLE "N8nIntegrationConfig" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "apiToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "N8nIntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "N8nIntegrationConfig_companyId_key" ON "N8nIntegrationConfig"("companyId");

-- CreateIndex
CREATE INDEX "N8nIntegrationConfig_companyId_idx" ON "N8nIntegrationConfig"("companyId");

-- AddForeignKey
ALTER TABLE "N8nIntegrationConfig" ADD CONSTRAINT "N8nIntegrationConfig_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

