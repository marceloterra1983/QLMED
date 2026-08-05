import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  accessLogCreate: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAdmin: mocks.requireAdmin,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/prisma', () => ({
  default: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
    accessLog: {
      create: mocks.accessLogCreate,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  }),
}));

import { PATCH } from '@/app/api/users/[id]/route';

function patchRequest(body: object): Request {
  return new Request('http://localhost/api/users/target-user', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function invokePatch(id: string, body: object) {
  return PATCH(patchRequest(body), { params: Promise.resolve({ id }) });
}

describe('PATCH /api/users/:id security contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    mocks.userFindUnique.mockResolvedValue({
      id: 'target-user',
      email: 'target@example.com',
      role: 'viewer',
      status: 'active',
      allowedPages: [],
    });
    mocks.userUpdate.mockResolvedValue({
      id: 'target-user',
      name: 'Target User',
      email: 'target@example.com',
      phone: null,
      role: 'editor',
      status: 'active',
      allowedPages: [],
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    mocks.accessLogCreate.mockResolvedValue({ id: 'log-1' });
  });

  it('returns 401 before persistence when authentication is absent', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const response = await invokePatch('target-user', { role: 'editor' });

    expect(response.status).toBe(401);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('returns 403 before persistence when the identity is not an admin', async () => {
    mocks.requireAdmin.mockRejectedValue(new Error('FORBIDDEN'));

    const response = await invokePatch('target-user', { role: 'editor' });

    expect(response.status).toBe(403);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects self-demotion before loading or updating the target', async () => {
    const response = await invokePatch('admin-1', { role: 'viewer' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Não é possível alterar seu próprio perfil' });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('rejects self-deactivation before loading or updating the target', async () => {
    const response = await invokePatch('admin-1', { status: 'inactive' });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Não é possível desativar sua própria conta' });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('increments tokenVersion and excludes passwordHash after a role change', async () => {
    const response = await invokePatch('target-user', { role: 'editor' });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).not.toHaveProperty('passwordHash');
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'target-user' },
      data: {
        role: 'editor',
        tokenVersion: { increment: 1 },
      },
      select: expect.not.objectContaining({ passwordHash: expect.anything() }),
    }));
  });

  it('increments tokenVersion and audits a status change', async () => {
    const response = await invokePatch('target-user', { status: 'inactive' });
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        status: 'inactive',
        tokenVersion: { increment: 1 },
      },
    }));
    expect(mocks.accessLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'status_changed',
        path: 'from=active to=inactive',
      },
    });
  });

  it('increments tokenVersion and audits an allowed-pages change', async () => {
    const response = await invokePatch('target-user', { allowedPages: ['/fiscal/invoices'] });
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        allowedPages: ['/fiscal/invoices'],
        tokenVersion: { increment: 1 },
      },
    }));
    expect(mocks.accessLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'pages_changed',
        path: 'count=1',
      },
    });
  });

  it('increments tokenVersion and attributes a password change to the administrator', async () => {
    const response = await invokePatch('target-user', { password: 'new-password' });
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        passwordHash: expect.any(String),
        tokenVersion: { increment: 1 },
      }),
    }));
    expect(mocks.accessLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'user_updated',
        path: 'target=target-user by=admin-1',
      },
    });
  });

  it('attributes sensitive-change audit events to the acting administrator', async () => {
    const response = await invokePatch('target-user', { role: 'editor' });
    await Promise.resolve();

    expect(response.status).toBe(200);
    expect(mocks.accessLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'role_changed',
        path: 'from=viewer to=editor',
      },
    });
    expect(mocks.accessLogCreate).toHaveBeenCalledWith({
      data: {
        userId: 'admin-1',
        action: 'user_updated',
        path: 'target=target-user by=admin-1',
      },
    });
  });
});
