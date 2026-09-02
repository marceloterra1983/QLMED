import { useEffect, useRef } from 'react';

/**
 * O cleanup chama `history.back()`, cujo popstate chega numa tarefa posterior.
 * Se entretanto o efeito voltou a montar (StrictMode em dev remonta todo
 * efeito: push, back, push), esse popstate cai no listener novo e fechava o
 * diálogo ~10 ms depois de abrir. O sinal vive no módulo porque quem o levanta
 * é a instância morta e quem o lê é a viva.
 */
let popstateProprioPendente = false;

export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    history.pushState({ modal: true }, '');
    const handler = () => {
      if (popstateProprioPendente) {
        popstateProprioPendente = false;
        return;
      }
      onCloseRef.current();
    };
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      if (history.state?.modal) {
        popstateProprioPendente = true;
        history.back();
      }
    };
  }, [isOpen]);
}
