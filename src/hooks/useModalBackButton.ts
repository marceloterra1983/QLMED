import { useEffect, useRef } from 'react';

export function useModalBackButton(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    history.pushState({ modal: true }, '');
    const handler = () => onCloseRef.current();
    window.addEventListener('popstate', handler);
    return () => {
      window.removeEventListener('popstate', handler);
      if (history.state?.modal) history.back();
    };
  }, [isOpen]);
}
