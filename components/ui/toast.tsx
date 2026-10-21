'use client';

import { useEffect, useState } from 'react';

// Minimal global toast. Any client component can call toast('...'); the single
// <Toaster /> mounted in the root layout renders it. Mirrors the demo's toast.
export function toast(message: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('manch:toast', { detail: message }));
}

export function Toaster() {
  const [msg, setMsg] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const handler = (e: Event) => {
      setMsg((e as CustomEvent<string>).detail);
      setShow(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShow(false), 2600);
    };
    window.addEventListener('manch:toast', handler);
    return () => {
      window.removeEventListener('manch:toast', handler);
      clearTimeout(timer);
    };
  }, []);

  return <div className={`toast${show ? ' show' : ''}`}>{msg}</div>;
}
