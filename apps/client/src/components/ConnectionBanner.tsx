import { connectionMessage, type ConnectionState } from '../net/connectionState';
import './ui.css';

/** Aviso global de conexão: acordando, reconectando ou partida pausada. */
export function ConnectionBanner({ state }: { state: ConnectionState }) {
  const msg = connectionMessage(state);
  if (!msg) return null;
  return (
    <div className={`conn-banner conn-${state.kind}`} role="status" aria-live="polite">
      <strong className="conn-title">{msg.title}</strong>
      <span className="conn-text">{msg.text}</span>
      {msg.detail && (
        <span className="conn-detail" aria-hidden="true">
          {msg.detail}
        </span>
      )}
    </div>
  );
}
