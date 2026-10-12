import { useState, type FormEvent } from 'react';
import { ROOM_CODE_LENGTH } from '@pfl/protocol';
import { normalizeRoomCode } from '../net/session';
import './lobby.css';

interface Props {
  busy: boolean;
  onCreate: () => void;
  onJoin: (code: string) => void;
  onBuilder: () => void;
}

/** Spec 6.1 (1): criar sala ou entrar com um código. Momento ousado do app: a palavra gigante "PFL". */
export function HomeScreen({ busy, onCreate, onJoin, onBuilder }: Props) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setError(`O código tem ${ROOM_CODE_LENGTH} letras (sem I e O).`);
      return;
    }
    setError(null);
    onJoin(normalized);
  };

  return (
    <main className="screen home">
      <div className="home-window">
        <div className="home-stage">
          <h1 className="home-wordmark">PFL</h1>
          <p className="home-subtitle">Pokémon Football League</p>
        </div>

        <div className="home-bar">
          <button type="button" className="btn btn-primary home-create" disabled={busy} onClick={onCreate}>
            Criar sala
          </button>
          <form className="home-join" onSubmit={submit} noValidate>
            <input
              className="input home-code"
              value={code}
              maxLength={12}
              placeholder="CÓDIGO"
              aria-label="Código da sala"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'home-code-error' : undefined}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
            <button type="submit" className="btn" disabled={busy}>
              Entrar
            </button>
          </form>
          <button type="button" className="btn home-builder" onClick={onBuilder}>
            Montar time
          </button>
        </div>
        {error && (
          <p id="home-code-error" className="error-text home-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <p className="muted home-hint">Monte um time, crie uma sala e passe o código de {ROOM_CODE_LENGTH} letras para um amigo.</p>
    </main>
  );
}
