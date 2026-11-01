import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Ctx = { sesiune: Session | null; incarcare: boolean };
const SesiuneCtx = createContext<Ctx>({ sesiune: null, incarcare: true });

export function SesiuneProvider({ children }: { children: ReactNode }) {
  const [sesiune, setSesiune] = useState<Session | null>(null);
  const [incarcare, setIncarcare] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesiune(data.session);
      setIncarcare(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, s) => setSesiune(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return <SesiuneCtx.Provider value={{ sesiune, incarcare }}>{children}</SesiuneCtx.Provider>;
}

export const useSesiune = () => useContext(SesiuneCtx);
export const useUid = () => useContext(SesiuneCtx).sesiune?.user.id ?? '';
