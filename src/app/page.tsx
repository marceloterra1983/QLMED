import Link from 'next/link';
import Image from 'next/image';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-white">
      <div className="flex flex-col items-center gap-8">
        <div className="relative w-[300px] h-[80px]">
          <Image
            src="/logo.svg"
            alt="QL MED Logo"
            fill
            className="object-contain"
            priority
          />
        </div>

        <Link
          href="/login"
          className="px-6 py-3 bg-gradient-to-r from-primary to-primary-dark hover:from-primary-dark hover:to-primary text-white rounded-xl transition-all font-bold shadow-md shadow-primary/30 hover:shadow-lg hover:shadow-primary/40"
        >
          Acessar Sistema
        </Link>
      </div>
    </main>
  );
}
