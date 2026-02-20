import prisma from '@/lib/prisma';

function withOneDayLookback(baseDate: Date): Date {
  const date = new Date(baseDate);
  date.setDate(date.getDate() - 1);
  return date;
}

export async function markCompanyForSyncRecovery(companyId: string, earliestIssueDate?: Date): Promise<void> {
  const fallbackDate = new Date();
  fallbackDate.setDate(fallbackDate.getDate() - 30);

  const targetStartDate = withOneDayLookback(earliestIssueDate ?? fallbackDate);

  await prisma.$transaction(async (tx) => {
    // Força replay de NSU na próxima sincronização SEFAZ.
    await tx.certificateConfig.updateMany({
      where: { companyId },
      data: {
        lastNsu: '000000000000000',
        lastSyncAt: null,
      },
    });

    const nsdocsConfig = await tx.nsdocsConfig.findUnique({
      where: { companyId },
      select: { id: true, lastSyncAt: true },
    });

    if (!nsdocsConfig) {
      return;
    }

    const currentStart = nsdocsConfig.lastSyncAt;
    const nextStart = currentStart && currentStart < targetStartDate
      ? currentStart
      : targetStartDate;

    await tx.nsdocsConfig.update({
      where: { id: nsdocsConfig.id },
      data: { lastSyncAt: nextStart },
    });
  });
}
