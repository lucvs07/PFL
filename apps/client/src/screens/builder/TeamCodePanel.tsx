import { useMemo, useState } from 'react';
import type { TeamDraft } from '../../builder/draft';
import { exportTeamCode, importTeamCode } from '../../builder/teamStore';
import './builder.css';

interface Props {
  draft: TeamDraft;
  onImport: (draft: TeamDraft, dropped: number) => void;
}

/** Exportar/importar o time como código de texto (spec 5.5). */
export function TeamCodePanel({ draft, onImport }: Props) {
  const code = useMemo(() => exportTeamCode(draft), [draft]);
  const [input, setInput] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setMessage({ ok: true, text: 'Código copiado.' });
    } catch {
      setMessage({ ok: false, text: 'Não foi possível copiar. Selecione o texto e copie manualmente.' });
    }
  };

  const doImport = () => {
    const result = importTeamCode(input);
    if (!result.ok) {
      setMessage({ ok: false, text: result.message });
      return;
    }
    onImport(result.draft, result.dropped);
    setInput('');
    setMessage({
      ok: true,
      text: result.dropped > 0 ? `Time importado. ${result.dropped} item(ns) inválido(s) foram descartados.` : 'Time importado.',
    });
  };

  return (
    <div className="code-panel">
      <section className="panel stack">
        <h2 className="panel-title">Exportar</h2>
        {code ? (
          <>
            <textarea className="input" rows={6} readOnly value={code} onFocus={(e) => e.currentTarget.select()} aria-label="Código do time" />
            <button type="button" className="btn" onClick={() => void copy()}>
              Copiar código
            </button>
          </>
        ) : (
          <p className="muted">Escolha um especialista para gerar o código.</p>
        )}
      </section>
      <section className="panel stack">
        <h2 className="panel-title">Importar</h2>
        <textarea
          className="input"
          rows={6}
          value={input}
          placeholder="Cole aqui o código de um time"
          aria-label="Código para importar"
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="button" className="btn btn-primary" disabled={!input.trim()} onClick={doImport}>
          Importar
        </button>
      </section>
      {message && (
        <p className={message.ok ? 'ok-text' : 'error-text'} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
