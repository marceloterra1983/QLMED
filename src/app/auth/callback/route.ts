import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import { requireAdmin } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  exchangeOneDriveCode,
  getOneDriveAccountEmail,
  getOneDriveDrive,
  getOneDriveProfile,
  listOneDriveChildren,
} from '@/lib/onedrive-client';
import { isValidOneDriveOAuthState, ONEDRIVE_OAUTH_STATE_COOKIE } from '@/lib/onedrive-oauth-state';

export const dynamic = 'force-dynamic';

type CallbackState = {
  ok: boolean;
  title: string;
  description: string;
  details?: string;
  files?: Array<{ id: string; name: string; isFolder: boolean }>;
};

function errorState(title: string, description: string, details?: string): CallbackState {
  return {
    ok: false,
    title,
    description,
    details,
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderHtml(state: CallbackState) {
  const statusClass = state.ok ? 'ok' : 'error';
  const details = state.details
    ? `<p class="details">${escapeHtml(state.details)}</p>`
    : '';
  const files = state.ok && state.files?.length
    ? `
      <div class="preview">
        <p class="preview-title">Itens na raiz (pre-visualizacao)</p>
        <ul>
          ${state.files.map((item) => `<li>${escapeHtml(item.name)} ${item.isFolder ? '(pasta)' : '(arquivo)'}</li>`).join('')}
        </ul>
      </div>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(state.title)}</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; background: #f8fafc; color: #0f172a; }
      main { max-width: 42rem; margin: 0 auto; padding: 2rem 1.5rem; }
      h1 { margin: 0 0 .75rem; font-size: 1.5rem; line-height: 2rem; font-weight: 650; }
      p { margin: 0 0 .75rem; font-size: .95rem; line-height: 1.5rem; }
      .ok { color: #047857; }
      .error, .details { color: #b91c1c; }
      .preview { margin: 1rem 0; border: 1px solid #e2e8f0; background: #fff; border-radius: .5rem; padding: .9rem 1rem; }
      .preview-title { margin-bottom: .5rem; color: #334155; font-weight: 650; }
      ul { margin: 0; padding-left: 1.35rem; color: #334155; font-size: .9rem; line-height: 1.45rem; }
      nav { display: flex; flex-wrap: wrap; gap: .9rem; margin-top: 1rem; font-size: .9rem; }
      a { color: #1d4ed8; text-decoration: underline; text-underline-offset: 2px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(state.title)}</h1>
      <p class="${statusClass}">${escapeHtml(state.description)}</p>
      ${details}
      ${files}
      <nav>
        <a href="/sistema/settings">Voltar para Configuracoes</a>
        <a href="/fiscal/invoices">Ir para Dashboard</a>
      </nav>
    </main>
  </body>
</html>`;
}

function callbackResponse(state: CallbackState, status = 200) {
  const response = new NextResponse(renderHtml(state), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
    },
  });
  response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, '', {
    maxAge: 0,
    path: '/',
  });
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const oauthError = request.nextUrl.searchParams.get('error');
  const oauthErrorDescription = request.nextUrl.searchParams.get('error_description');
  const receivedState = request.nextUrl.searchParams.get('state');
  const expectedState = request.cookies.get(ONEDRIVE_OAUTH_STATE_COOKIE)?.value;

  if (!isValidOneDriveOAuthState(receivedState, expectedState)) {
    return callbackResponse(
      errorState(
        'Callback OneDrive invalido',
        'A sessao de autorizacao expirou ou nao corresponde ao login iniciado.',
        'Volte para Configuracoes e gere uma nova autorizacao OneDrive.'
      ),
      400
    );
  }

  if (oauthError) {
    return callbackResponse(
      errorState(
        'Falha na autorizacao OneDrive',
        oauthError,
        oauthErrorDescription || 'Sem detalhes adicionais.'
      ),
      400
    );
  }

  if (!code) {
    return callbackResponse(
      errorState(
        'Callback sem codigo',
        'A URL foi acessada sem o parametro code. Refaca o login para gerar um novo codigo.'
      ),
      400
    );
  }

  try {
    const auth = await requireAdmin();
    const company = await getOrCreateSingleCompany(auth.userId);

    const token = await exchangeOneDriveCode(code);
    const [profile, drive] = await Promise.all([
      getOneDriveProfile(token.access_token),
      getOneDriveDrive(token.access_token),
    ]);

    const accountEmail = getOneDriveAccountEmail(profile);
    if (!accountEmail) {
      return callbackResponse(
        errorState(
          'Conta sem e-mail identificado',
          'Nao foi possivel identificar o e-mail da conta Microsoft conectada.'
        ),
        400
      );
    }

    const expiresAt = new Date(Date.now() + Math.max(token.expires_in - 60, 1) * 1000);
    const refreshTokenUpdate = token.refresh_token
      ? { refreshToken: encrypt(token.refresh_token) }
      : {};

    await prisma.oneDriveConnection.upsert({
      where: {
        companyId_accountEmail: {
          companyId: company.id,
          accountEmail,
        },
      },
      update: {
        accountName: profile.displayName || null,
        microsoftUserId: profile.id,
        driveId: drive.id,
        driveType: drive.driveType || null,
        driveWebUrl: drive.webUrl || null,
        accessToken: encrypt(token.access_token),
        ...refreshTokenUpdate,
        tokenExpiresAt: expiresAt,
        scope: token.scope || null,
        lastValidatedAt: new Date(),
      },
      create: {
        companyId: company.id,
        accountEmail,
        accountName: profile.displayName || null,
        microsoftUserId: profile.id,
        driveId: drive.id,
        driveType: drive.driveType || null,
        driveWebUrl: drive.webUrl || null,
        accessToken: encrypt(token.access_token),
        refreshToken: token.refresh_token ? encrypt(token.refresh_token) : null,
        tokenExpiresAt: expiresAt,
        scope: token.scope || null,
        lastValidatedAt: new Date(),
      },
    });

    const items = await listOneDriveChildren(token.access_token, drive.id, 'root');

    return callbackResponse({
      ok: true,
      title: 'OneDrive conectado com sucesso',
      description: `Conta conectada: ${accountEmail}`,
      files: items.slice(0, 5).map((item) => ({
        id: item.id,
        name: item.name,
        isFolder: Boolean(item.folder),
      })),
    });
  } catch (error) {
    const status =
      error instanceof Error && error.message === 'NOT_AUTHENTICATED'
        ? 401
        : error instanceof Error && error.message === 'FORBIDDEN'
          ? 403
          : 500;
    const message =
      error instanceof Error && error.message === 'NOT_AUTHENTICATED'
        ? 'Voce precisa estar logado no QLMED para concluir a conexao.'
        : error instanceof Error && error.message === 'FORBIDDEN'
          ? 'Apenas administradores podem concluir a conexao OneDrive.'
          : error instanceof Error
            ? error.message
            : 'Erro inesperado';

    return callbackResponse(
      errorState(
        'Falha ao concluir conexao com OneDrive',
        message
      ),
      status
    );
  }
}
