/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // navActive/navIdle da Nova NF-e vivem em form-steps.ts — sem isto o JIT
    // dropa bg-blue-600 e o ativo vira texto branco sobre pastel (forms plugin).
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  safelist: [
    'bg-blue-600',
    'bg-emerald-700',
    'bg-amber-800',
    'bg-violet-600',
    'bg-slate-700',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        'primary-dark': '#1d4ed8',
        accent: '#10b981',
        'background-light': '#f8fafc',
        'background-dark': '#0f172a',
        'card-dark': '#1e293b',
        'surface-sunken': '#1a1e2e',
      },
      // Sombras das folhas de cabeçalho/rodapé no celular — antes eram 16 cópias
      // de `shadow-[0_2px_8px_rgba(0,0,0,0.08)]` nos modais migrados.
      boxShadow: {
        'sheet-top': '0 2px 8px rgba(0, 0, 0, 0.08)',
        'sheet-bottom': '0 -4px 12px rgba(0, 0, 0, 0.06)',
      },
      fontFamily: {
        display: ['var(--font-manrope)', 'sans-serif'],
        sans: ['var(--font-manrope)', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
