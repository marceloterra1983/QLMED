'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { PAGE_GROUPS, ALL_PAGES } from '@/lib/navigation';

interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  allowedPages: string[];
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Visualizador',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  active: 'Ativo',
  inactive: 'Inativo',
  rejected: 'Rejeitado',
};

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  editor: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  viewer: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default function UsuariosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [pagesUser, setPagesUser] = useState<User | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ user: User; action: 'approve' | 'reject' } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createRole, setCreateRole] = useState('viewer');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  // Pages modal state
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [allPagesChecked, setAllPagesChecked] = useState(true);
  const [pagesLoading, setPagesLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Guard: redirect non-admins
  useEffect(() => {
    if (!mounted || status !== 'authenticated') return;
    if (session?.user?.role !== 'admin') {
      router.replace('/visaogeral');
    }
  }, [mounted, status, session, router]);

  const loadUsers = useCallback(async () => {
    if (status !== 'authenticated') return;
    if (session?.user?.role !== 'admin') return;
    try {
      const res = await fetch('/api/users');
      if (!res.ok) {
        if (res.status === 403) {
          router.replace('/visaogeral');
          return;
        }
        throw new Error('Erro ao carregar usuários');
      }
      const data = await res.json();
      setUsers(data.users);
    } catch {
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  }, [router, status, session?.user?.role]);

  useEffect(() => {
    if (!mounted || status !== 'authenticated') return;
    if (session?.user?.role !== 'admin') return;
    loadUsers();
  }, [mounted, status, session?.user?.role, loadUsers]);

  const resetCreateForm = () => {
    setCreateName('');
    setCreateEmail('');
    setCreatePhone('');
    setCreatePassword('');
    setCreateRole('viewer');
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    resetCreateForm();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          role: createRole,
          phone: createPhone || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao criar usuário');
        return;
      }
      toast.success('Usuário criado');
      closeCreateModal();
      loadUsers();
    } catch {
      toast.error('Erro ao criar usuário');
    } finally {
      setCreateLoading(false);
    }
  };

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPhone(user.phone || '');
    setEditRole(user.role);
    setEditStatus(user.status);
    setEditPassword('');
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditLoading(true);
    try {
      const payload: any = {
        name: editName,
        email: editEmail,
        phone: editPhone,
        role: editRole,
        status: editStatus,
      };
      if (editPassword) {
        if (editPassword.length < 6) {
          toast.error('Senha deve ter no mínimo 6 caracteres');
          setEditLoading(false);
          return;
        }
        payload.password = editPassword;
      }
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao atualizar');
        return;
      }
      toast.success('Usuário atualizado');
      setEditingUser(null);
      loadUsers();
    } catch {
      toast.error('Erro ao atualizar');
    } finally {
      setEditLoading(false);
    }
  };

  const openPages = (user: User) => {
    setPagesUser(user);
    if (user.allowedPages.length === 0) {
      setAllPagesChecked(true);
      setSelectedPages([]);
    } else {
      setAllPagesChecked(false);
      setSelectedPages([...user.allowedPages]);
    }
  };

  const handleToggleAllPages = () => {
    if (allPagesChecked) {
      setAllPagesChecked(false);
      setSelectedPages(ALL_PAGES.map((p) => p.path));
    } else {
      setAllPagesChecked(true);
      setSelectedPages([]);
    }
  };

  const handleTogglePage = (path: string) => {
    setSelectedPages((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      setAllPagesChecked(false);
      return next;
    });
  };

  const handleToggleGroup = (groupPaths: string[]) => {
    setSelectedPages((prev) => {
      const allSelected = groupPaths.every((p) => prev.includes(p));
      const next = allSelected
        ? prev.filter((p) => !groupPaths.includes(p))
        : Array.from(new Set([...prev, ...groupPaths]));
      setAllPagesChecked(false);
      return next;
    });
  };

  const handleSavePages = async () => {
    if (!pagesUser) return;
    if (!allPagesChecked && selectedPages.length === 0) {
      toast.error('Selecione pelo menos uma página ou marque "Todas as páginas"');
      return;
    }
    setPagesLoading(true);
    try {
      const res = await fetch(`/api/users/${pagesUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          allowedPages: allPagesChecked ? [] : selectedPages,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro ao salvar');
        return;
      }
      toast.success('Páginas atualizadas');
      setPagesUser(null);
      loadUsers();
    } catch {
      toast.error('Erro ao salvar');
    } finally {
      setPagesLoading(false);
    }
  };

  const handleQuickAction = async (user: User, action: 'approve' | 'reject') => {
    const newStatus = action === 'approve' ? 'active' : 'rejected';
    setConfirmLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Erro');
        return;
      }
      toast.success(action === 'approve' ? 'Usuário aprovado' : 'Usuário rejeitado');
      loadUsers();
    } catch {
      toast.error('Erro ao processar');
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  const pendingUsers = users.filter((u) => u.status === 'pending');
  const activeCount = users.filter((u) => u.status === 'active').length;
  const inactiveCount = users.filter((u) => u.status === 'inactive' || u.status === 'rejected').length;

  if (!mounted || status === 'loading') {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">Carregando usuários...</p>
      </div>
    );
  }

  if (status !== 'authenticated' || session?.user?.role !== 'admin') {
    return null;
  }

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <span className="material-symbols-outlined text-primary text-[28px]">manage_accounts</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Usuários</h1>
            <p className="text-sm text-slate-500">Gerenciar contas e permissões</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-gradient-to-r from-primary to-primary-dark text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40 transition-all"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Novo Usuário
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
              <span className="material-symbols-outlined text-slate-600 dark:text-slate-400 text-[20px]">group</span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Total</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{users.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-card-dark border border-amber-200 dark:border-amber-800/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[20px]">pending</span>
            </div>
            <div>
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Pendentes</p>
              <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{pendingUsers.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-card-dark border border-green-200 dark:border-green-800/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <span className="material-symbols-outlined text-green-600 dark:text-green-400 text-[20px]">check_circle</span>
            </div>
            <div>
              <p className="text-xs text-green-600 dark:text-green-400 font-medium">Ativos</p>
              <p className="text-xl font-bold text-green-700 dark:text-green-300">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800">
              <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">block</span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium">Inativos</p>
              <p className="text-xl font-bold text-slate-700 dark:text-slate-300">{inactiveCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending users highlight */}
      {pendingUsers.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-amber-600 text-[20px]">notification_important</span>
            <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400">
              {pendingUsers.length} {pendingUsers.length === 1 ? 'conta pendente' : 'contas pendentes'} de aprovação
            </h2>
          </div>
          <div className="space-y-3">
            {pendingUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between bg-white dark:bg-card-dark border border-amber-100 dark:border-amber-800/30 rounded-lg p-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white">{user.name}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setConfirmAction({ user, action: 'approve' })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">check</span>
                    Aprovar
                  </button>
                  <button
                    onClick={() => setConfirmAction({ user, action: 'reject' })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="bg-white dark:bg-card-dark border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-[24px] animate-spin text-slate-400">progress_activity</span>
            <p className="text-sm text-slate-500 mt-2">Carregando...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center">
            <span className="material-symbols-outlined text-[48px] text-slate-300 dark:text-slate-600">group_off</span>
            <p className="text-sm text-slate-500 mt-2">Nenhum usuário cadastrado</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Nome</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Email</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Telefone</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Perfil</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="text-left text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Criado em</th>
                    <th className="text-right text-xs font-bold text-slate-500 uppercase tracking-wider px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-slate-900 dark:text-white">{user.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">{user.email}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-600 dark:text-slate-300">{user.phone || '—'}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[user.role] || ''}`}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[user.status] || ''}`}>
                          {STATUS_LABELS[user.status] || user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-slate-500">
                          {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(user)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Editar"
                          >
                            <span className="material-symbols-outlined text-[20px]">edit</span>
                          </button>
                          <button
                            onClick={() => openPages(user)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                            title="Controle de páginas"
                          >
                            <span className="material-symbols-outlined text-[20px]">tune</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card view */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((user) => (
                <div key={user.id} className="p-3">
                  {/* Name and badges */}
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-xs font-bold text-slate-900 dark:text-white leading-snug">{user.name}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${ROLE_COLORS[user.role] || ''}`}>
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_COLORS[user.status] || ''}`}>
                        {STATUS_LABELS[user.status] || user.status}
                      </span>
                    </div>
                  </div>

                  {/* Secondary fields */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] mb-1.5">
                    <div className="col-span-2">
                      <span className="text-slate-400 font-medium">Email</span>
                      <p className="text-slate-700 dark:text-slate-300 truncate">{user.email}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Telefone</span>
                      <p className="text-slate-700 dark:text-slate-300">{user.phone || '—'}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Criado em</span>
                      <p className="text-slate-700 dark:text-slate-300">
                        {new Date(user.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEdit(user)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                      Editar
                    </button>
                    <button
                      onClick={() => openPages(user)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg text-violet-600 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[16px]">tune</span>
                      Páginas
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Confirm approve/reject dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && handleQuickAction(confirmAction.user, confirmAction.action)}
        title={confirmAction?.action === 'approve' ? 'Aprovar conta' : 'Rejeitar conta'}
        message={
          confirmAction
            ? confirmAction.action === 'approve'
              ? `Aprovar a conta de ${confirmAction.user.name} (${confirmAction.user.email})? O usuário poderá acessar o sistema como Visualizador.`
              : `Rejeitar a conta de ${confirmAction.user.name} (${confirmAction.user.email})? O usuário não poderá acessar o sistema.`
            : ''
        }
        confirmLabel={confirmAction?.action === 'approve' ? 'Aprovar' : 'Rejeitar'}
        confirmVariant={confirmAction?.action === 'approve' ? 'primary' : 'danger'}
        loading={confirmLoading}
      />

      {/* Create user modal */}
      <Modal isOpen={showCreateModal} onClose={closeCreateModal} title="Novo Usuário" width="max-w-lg">
        <form onSubmit={handleCreate} className="space-y-4 p-1">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Nome</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              required
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Email</label>
            <input
              type="email"
              value={createEmail}
              onChange={(e) => setCreateEmail(e.target.value)}
              required
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
              Telefone <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="tel"
              value={createPhone}
              onChange={(e) => setCreatePhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Senha</label>
            <input
              type="password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              required
              minLength={6}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Perfil</label>
            <select
              value={createRole}
              onChange={(e) => setCreateRole(e.target.value)}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="viewer">Visualizador</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeCreateModal}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold rounded-lg shadow-md disabled:opacity-50 transition-all"
            >
              {createLoading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
              Criar
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal isOpen={!!editingUser} onClose={() => setEditingUser(null)} title="Editar Usuário" width="max-w-lg">
        <form onSubmit={handleEdit} className="space-y-4 p-1">
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Nome</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              required
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Email</label>
            <input
              type="email"
              value={editEmail}
              onChange={(e) => setEditEmail(e.target.value)}
              required
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
              Telefone <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="tel"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Perfil</label>
            <select
              value={editRole}
              onChange={(e) => setEditRole(e.target.value)}
              disabled={editingUser?.id === session?.user?.id}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              <option value="viewer">Visualizador</option>
              <option value="editor">Editor</option>
              <option value="admin">Admin</option>
            </select>
            {editingUser?.id === session?.user?.id && (
              <p className="text-xs text-slate-400 mt-1">Não é possível alterar seu próprio perfil</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">Status</label>
            <select
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              disabled={editingUser?.id === session?.user?.id}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50"
            >
              <option value="pending">Pendente</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
              <option value="rejected">Rejeitado</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
              Nova senha <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              type="password"
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              placeholder="Deixe vazio para manter a atual"
              minLength={6}
              className="block w-full px-3 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={editLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold rounded-lg shadow-md disabled:opacity-50 transition-all"
            >
              {editLoading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
              Salvar
            </button>
          </div>
        </form>
      </Modal>

      {/* Pages access modal */}
      <Modal isOpen={!!pagesUser} onClose={() => setPagesUser(null)} title={`Páginas — ${pagesUser?.name || ''}`} width="max-w-lg">
        <div className="p-1 space-y-4">
          <p className="text-sm text-slate-500">
            Selecione quais páginas este usuário pode acessar. Admin sempre tem acesso total.
          </p>

          {/* Select all toggle */}
          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors">
            <input
              type="checkbox"
              checked={allPagesChecked}
              onChange={handleToggleAllPages}
              className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/50"
            />
            <span className="text-sm font-bold text-slate-900 dark:text-white">Todas as páginas</span>
            <span className="text-xs text-slate-400 ml-auto">Acesso completo</span>
          </label>

          {/* Grouped pages */}
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {PAGE_GROUPS.map((group) => {
              const groupPaths = group.pages.map((p) => p.path);
              const allGroupSelected = groupPaths.every((p) => selectedPages.includes(p));
              const someGroupSelected = groupPaths.some((p) => selectedPages.includes(p));
              return (
                <div
                  key={group.section}
                  className={`border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden ${
                    allPagesChecked ? 'opacity-50 pointer-events-none' : ''
                  }`}
                >
                  {/* Group header */}
                  <label className="flex items-center gap-3 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <input
                      type="checkbox"
                      checked={allPagesChecked || allGroupSelected}
                      ref={(el) => { if (el) el.indeterminate = !allPagesChecked && someGroupSelected && !allGroupSelected; }}
                      onChange={() => handleToggleGroup(groupPaths)}
                      disabled={allPagesChecked}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/50"
                    />
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{group.section}</span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {allPagesChecked ? groupPaths.length : groupPaths.filter((p) => selectedPages.includes(p)).length}/{groupPaths.length}
                    </span>
                  </label>
                  {/* Group pages */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-0">
                    {group.pages.map((page) => (
                      <label
                        key={page.path}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={allPagesChecked || selectedPages.includes(page.path)}
                          onChange={() => handleTogglePage(page.path)}
                          disabled={allPagesChecked}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/50"
                        />
                        <span className="text-sm text-slate-700 dark:text-slate-200">{page.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {!allPagesChecked && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedPages(ALL_PAGES.map((p) => p.path))}
                className="text-xs text-primary hover:text-primary-dark font-medium transition-colors"
              >
                Selecionar todas
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => setSelectedPages([])}
                className="text-xs text-primary hover:text-primary-dark font-medium transition-colors"
              >
                Desmarcar todas
              </button>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setPagesUser(null)}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSavePages}
              disabled={pagesLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-primary to-primary-dark text-white text-sm font-bold rounded-lg shadow-md disabled:opacity-50 transition-all"
            >
              {pagesLoading && <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>}
              Salvar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
