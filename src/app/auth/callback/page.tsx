import Link from 'next/link';
import prisma from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import { requireAuth } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  exchangeOneDriveCode,
  getOneDriveAccountEmail,
  getOneDriveDrive,
  getOneDriveProfile,
  listOneDriveChildren,
} from '@/lib/onedrive-client';

export const dynamic = 'force-dynamic';

type CallbackPageProps = {
  searchParams: {
    code?: string;
    error?: string;
    error_description?: string;
    state?: string;
  };
};

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

export default async function OneDriveCallbackPage({ searchParams }: CallbackPageProps) {
  const code = searchParams.code;
  const oauthError = searchParams.error;
  const oauthErrorDescription = searchParams.error_description;

  let state: CallbackState;

  if (oauthError) {
    state = errorState(
      'Falha na autorização OneDrive',
      oauthError,
      oauthErrorDescription || 'Sem detalhes adicionais.'
    );
  } else if (!code) {
    state = errorState(
      'Callback sem código',
      'A URL foi acessada sem o parâmetro code. Refaça o login para gerar um novo código.'
    );
  } else {
    try {
      const userId = await requireAuth();
      const company = await getOrCreateSingleCompany(userId);

      const token = await exchangeOneDriveCode(code);
      const [profile, drive] = await Promise.all([
        getOneDriveProfile(token.access_token),
        getOneDriveDrive(token.access_token),
      ]);

      const accountEmail = getOneDriveAccountEmail(profile);
      if (!accountEmail) {
        state = errorState(
          'Conta sem e-mail identificado',
          'Não foi possível identificar o e-mail da conta Microsoft conectada.'
        );
      } else {
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

        state = {
          ok: true,
          title: 'OneDrive conectado com sucesso',
          description: `Conta conectada: ${accountEmail}`,
          files: items.slice(0, 5).map((item) => ({
            id: item.id,
            name: item.name,
            isFolder: Boolean(item.folder),
          })),
        };
      }
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'NOT_AUTHENTICATED'
          ? 'Você precisa estar logado no QLMED para concluir a conexão.'
          : error instanceof Error
            ? error.message
            : 'Erro inesperado';

      state = errorState(
        'Falha ao concluir conexão com OneDrive',
        message
      );
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-3 text-2xl font-semibold">{state.title}</h1>

      <p className={`mb-3 text-sm ${state.ok ? 'text-emerald-700' : 'text-red-700'}`}>
        {state.description}
      </p>

      {state.details ? <p className="mb-3 text-sm text-red-700">{state.details}</p> : null}

      {state.ok && state.files ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-700">Itens na raiz (prévia)</p>
          <ul className="list-disc space-y-1 pl-6 text-sm text-slate-700">
            {state.files.map((item) => (
              <li key={item.id}>
                {item.name} {item.isFolder ? '(pasta)' : '(arquivo)'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 text-sm">
        <Link className="text-blue-700 underline" href="/dashboard/settings">
          Voltar para Configurações
        </Link>
        <Link className="text-blue-700 underline" href="/dashboard">
          Ir para Dashboard
        </Link>
      </div>
    </main>
  );
}
