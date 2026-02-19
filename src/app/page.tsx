import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-white">
      <div className="flex flex-col items-center gap-8">
        <div className="relative w-[300px] h-[100px]">
          <Image
            src="/logo.png"
            alt="QL MED Logo"
            fill
            className="object-contain"
            priority
          />
        </div>

        <Link
          href="/login"
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          Acessar Sistema
        </Link>
      </div>
    </main>
  );
}
