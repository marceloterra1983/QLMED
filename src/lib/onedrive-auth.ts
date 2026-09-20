type RefreshBinding = {
  connectionId: string;
  refresh: () => Promise<string>;
};

const bindings = new Map<string, RefreshBinding>();
const latestByConnection = new Map<string, string>();
const refreshInflight = new Map<string, Promise<string>>();

/**
 * Liga o access token emitido ao refresh da conexão. O transporte Graph não
 * vê Prisma: em 401 ele pede token novo por este mapa.
 */
export function bindOneDriveAccessTokenRefresh(
  accessToken: string,
  connectionId: string,
  refresh: () => Promise<string>,
): void {
  // Mantém o JWT anterior bound: um GET já em voo pode voltar 401 depois
  // de um refresh concorrente. Um Map de tokens por hora é irrelevante.
  bindings.set(accessToken, { connectionId, refresh });
  latestByConnection.set(connectionId, accessToken);
}

/** Token atual da conexão, se este JWT já foi renovado no mesmo processo. */
export function resolveBoundOneDriveAccessToken(accessToken: string): string {
  const binding = bindings.get(accessToken);
  if (!binding) return accessToken;
  return latestByConnection.get(binding.connectionId) ?? accessToken;
}

export async function refreshBoundOneDriveAccessToken(accessToken: string): Promise<string | null> {
  const binding = bindings.get(accessToken);
  if (!binding) return null;

  const latest = latestByConnection.get(binding.connectionId);
  if (latest && latest !== accessToken) {
    return latest;
  }

  const existing = refreshInflight.get(binding.connectionId);
  if (existing) return existing;

  const pending = binding.refresh().finally(() => {
    refreshInflight.delete(binding.connectionId);
  });
  refreshInflight.set(binding.connectionId, pending);
  return pending;
}

export function resetOneDriveAuthBindingsForTests(): void {
  bindings.clear();
  latestByConnection.clear();
  refreshInflight.clear();
}
