// Acesso seguro a localStorage/sessionStorage. Em modo privado, com cookies bloqueados ou com a cota cheia,
// até ler `window.localStorage` pode lançar. Nenhuma função daqui lança.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PROBE_KEY = '__pfl_probe__';

export function probeStorage(get: () => StorageLike | null | undefined): StorageLike | null {
  try {
    const storage = get();
    if (!storage) return null;
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
    return storage;
  } catch {
    return null;
  }
}

export function getLocalStorage(): StorageLike | null {
  return probeStorage(() => (typeof window === 'undefined' ? null : window.localStorage));
}

export function getSessionStorage(): StorageLike | null {
  return probeStorage(() => (typeof window === 'undefined' ? null : window.sessionStorage));
}

export function readJson(storage: StorageLike | null, key: string): unknown {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeKey(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // nada a fazer: o storage está indisponível
  }
}

/** Substituto em memória quando o navegador não oferece storage (dura até recarregar a aba). */
export function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
