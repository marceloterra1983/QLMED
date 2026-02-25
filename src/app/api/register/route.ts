import { NextResponse } from 'next/server';
import { hash } from 'bcryptjs';
import prisma from '@/lib/prisma';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, email, password, phone } = body;

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter no mínimo 6 caracteres' }, { status: 400 });
    }

    const emailLower = email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email: emailLower },
    });

    if (existing) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }

    // First user ever becomes admin + active
    const userCount = await prisma.user.count();
    const isFirstUser = userCount === 0;

    const passwordHash = await hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: emailLower,
        passwordHash,
        phone: phone?.trim() || null,
        role: isFirstUser ? 'admin' : 'viewer',
        status: isFirstUser ? 'active' : 'pending',
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
      },
    });

    if (isFirstUser) {
      return NextResponse.json({
        message: 'Conta de administrador criada com sucesso',
        user,
      });
    }

    return NextResponse.json({
      message: 'Conta criada. Aguarde aprovação do administrador.',
      user,
    });
  } catch (error) {
    console.error('Error in registration:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
