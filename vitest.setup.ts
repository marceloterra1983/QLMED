/**
 * Setup partilhado da suíte.
 *
 * Roda para TODOS os ficheiros, inclusive os de ambiente `node`, por isso tudo
 * aqui é guardado por `typeof window`. O que existe é o mínimo que o jsdom não
 * implementa e que os componentes reais usam — nada de stub de comportamento
 * do produto, senão o teste de render deixaria de testar o produto.
 */

if (typeof window !== 'undefined') {
  // jsdom não implementa matchMedia; vários componentes (InvoiceDetailsModal,
  // por exemplo) decidem layout mobile/desktop com ela.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  // jsdom não implementa URL.createObjectURL (usado nos downloads de CSV/XML).
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:qlmed-test';
    URL.revokeObjectURL = () => {};
  }
}

export {};
