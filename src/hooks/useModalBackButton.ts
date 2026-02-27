import { useEffect } from 'react';

export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    history.pushState({ modal: true }, '');
    const handler = () => onClose();
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      if (history.state?.modal) history.back();
    };
  }, [isOpen, onClose]);
}
