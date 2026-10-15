import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FormationId, PackageId, PlayerView, Team } from '@pfl/engine';
import type { RoomState } from '@pfl/protocol';
import { applyDepthAction, type DepthAction } from '../../builder/depth';
import { canSubmitCard, panelMode, timerSeconds, type MatchClientState } from '../../match/matchState';
import { draftFromTeamDepth, shouldSendDepth, type DepthDraft } from '../../match/depthDraft';
import { FORMATION_LABELS } from '../../lib/names';
import { PhaserField } from '../../phaser/PhaserField';
import type { PlaySpec } from '../../phaser/FieldScene';
import { Hud } from './Hud';
import { NarrationLog } from './NarrationLog';
import { RevealBanner } from './RevealBanner';
import { FORMATION_OPTIONS, LineupPicker, PACKAGE_OPTIONS } from './LineupPicker';
import { CardHand } from './CardHand';
import { ConversionPicker } from './ConversionPicker';
import { DepthPanel } from './DepthPanel';
import './match.css';

interface Props {
  state: MatchClientState;
  room: RoomState;
  myTeam: Team | null;
  now: number;
  onFormation: (id: FormationId) => void;
  onPackage: (id: PackageId) => void;
  onCard: (cardId: string) => void;
  onConversion: (choice: 'PAT' | 'TWO') => void;
  onSendDepth: (draft: DepthDraft) => void;
}

function waitingText(view: PlayerView): string {
  switch (view.phase) {
    case 'FORMATION':
      return view.side === 'offense' ? 'Formação enviada. Aguardando a defesa...' : 'O ataque está escolhendo a formação...';
    case 'PACKAGE':
      return view.side === 'defense' ? 'Pacote enviado. Aguardando...' : 'A defesa está escolhendo o pacote...';
    case 'PLAYCALL':
      return view.opponentHasChosen ? 'Revelando as cartas...' : 'Carta escolhida. Aguardando o adversário...';
    case 'CONVERSION':
      return view.side === 'offense' ? 'Conversão enviada.' : 'O ataque está escolhendo a conversão...';
    case 'MATCH_END':
      return 'Fim de jogo!';
  }
}

/** Spec 6.2: HUD em cima, campo Phaser vertical, log lateral e painel que muda por etapa. */
export function MatchScreen({ state, room, myTeam, now, onFormation, onPackage, onCard, onConversion, onSendDepth }: Props) {
  const view = state.view;
  const mode = panelMode(state, now);
  const animating = mode === 'ANIMATING';
  const [depthOpen, setDepthOpen] = useState(false);
  const [draft, setDraft] = useState<DepthDraft | null>(() => (myTeam ? draftFromTeamDepth(myTeam) : null));
  const [lastSentTurn, setLastSentTurn] = useState<number | null>(null);

  useEffect(() => {
    if (myTeam && !draft) setDraft(draftFromTeamDepth(myTeam));
  }, [myTeam, draft]);

  // A janela da defesa fecha assim que o ataque envia a formação: o rascunho sai sozinho, uma vez por turnId.
  useEffect(() => {
    if (view && draft && shouldSendDepth(view, myTeam, draft, lastSentTurn)) {
      setLastSentTurn(view.turnId);
      onSendDepth(draft);
    }
  }, [view, myTeam, draft, lastSentTurn, onSendDepth]);

  const play = useMemo<PlaySpec | null>(
    () => (state.animation ? { seq: state.animation.seq, stage: state.animation.stage, steps: state.animation.steps } : null),
    [state.animation],
  );

  if (!view) {
    return (
      <main className="screen screen-center">
        <div className="panel">Sincronizando a partida...</div>
      </main>
    );
  }

  const levels = view.fatigue[view.you] ?? {};
  const applyDepth = (a: DepthAction) => {
    if (!myTeam) return;
    setDraft((d) => applyDepthAction(d ?? draftFromTeamDepth(myTeam), myTeam.roster, a));
  };

  let panel: ReactNode;
  switch (mode) {
    case 'ANIMATING':
      panel = <p className="match-status">Jogada em andamento...</p>;
      break;
    case 'PICK_FORMATION':
      panel = (
        <div className="side-offense">
          <LineupPicker
            title="Escolha a formação"
            hint="A defesa verá quem está em campo e em quais vagas."
            options={FORMATION_OPTIONS}
            team={myTeam}
            levels={levels}
            onPick={onFormation}
          />
        </div>
      );
      break;
    case 'PICK_PACKAGE':
      panel = (
        <div className="side-defense">
          <LineupPicker
            title={`O ataque entrou em ${view.formation ? FORMATION_LABELS[view.formation] : '?'}. Escolha o pacote`}
            options={PACKAGE_OPTIONS}
            team={myTeam}
            levels={levels}
            onPick={onPackage}
          />
        </div>
      );
      break;
    case 'PICK_CARD':
      panel = (
        <>
          <h3 className="match-panel-title">Escolha sua carta ({view.side === 'offense' ? 'ataque' : 'defesa'})</h3>
          <CardHand view={view} canPick={(id) => canSubmitCard(state, id, now)} onPick={onCard} />
          <p className="match-hint">
            Adversário: {view.opponentHasChosen ? 'já escolheu' : 'escolhendo...'} · {view.opponentHandSize} cartas na mão
          </p>
        </>
      );
      break;
    case 'PICK_CONVERSION':
      panel = (
        <>
          <h3 className="match-panel-title">Touchdown! Escolha a conversão</h3>
          <ConversionPicker onPick={onConversion} />
        </>
      );
      break;
    case 'WAIT_OPPONENT':
      panel = <p className="match-status">{waitingText(view)}</p>;
      break;
    case 'ENDED':
      panel = <p className="match-status">Fim de jogo!</p>;
      break;
    case 'WAITING':
      panel = <p className="match-status">Aguardando o servidor...</p>;
      break;
  }

  return (
    <main className="match">
      <Hud view={view} names={state.names} seconds={animating ? null : timerSeconds(state, now)} />
      <section className="match-field">
        <PhaserField stage={animating && state.animation ? state.animation.stage : state.stage} play={animating ? play : null} />
        {animating && <RevealBanner reveal={state.reveal} />}
      </section>
      <div className="match-side">
        <section className="match-panel panel" aria-label="Decisão">
          {panel}
          <div className="match-tools">
            <button type="button" className="btn btn-small" disabled={!myTeam} onClick={() => setDepthOpen((o) => !o)}>
              {depthOpen ? 'Fechar depth chart' : 'Depth chart'}
            </button>
            {view.canEditDepth && <span className="ok-text">Janela de ajuste do depth chart aberta.</span>}
          </div>
          {depthOpen && myTeam && draft && (
            <DepthPanel
              team={myTeam}
              draft={draft}
              canEditNow={view.canEditDepth && view.phase === 'FORMATION'}
              onAction={applyDepth}
              onReset={() => setDraft(draftFromTeamDepth(myTeam))}
            />
          )}
        </section>
        <aside className="match-log panel">
          <NarrationLog lines={state.log} />
        </aside>
      </div>
    </main>
  );
}
