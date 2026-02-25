import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  const h = headers();
  const obj: Record<string, string> = {};
  h.forEach((v, k) => { obj[k] = v; });
  return NextResponse.json({ headers: obj, apiKeyEnv: !!process.env.QLMED_API_KEY });
}
