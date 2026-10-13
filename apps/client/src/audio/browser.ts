// Ligações com o navegador: desbloqueio por gesto, aba oculta e som de clique nos botões.
import type { Audio } from './engine';

const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

/** Botão ativo fora do próprio controle de som. */
export function shouldClickSound(target: Element | null): boolean {
  const button = target?.closest?.('button, [role="button"]');
  if (!button) return false;
  if (button.closest('.audio-control')) return false;
  if ((button as HTMLButtonElement).disabled === true) return false;
  return button.getAttribute('aria-disabled') !== 'true';
}

export function installBrowserHooks(audio: Audio): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const unlock = () => audio.unlock(); // idempotente e barato: retoma o contexto se o navegador o suspendeu
  const onClick = (e: MouseEvent) => {
    if (shouldClickSound(e.target as Element | null)) audio.play('ui-click');
  };
  const onVisibility = () => audio.setHidden(document.hidden);

  for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
  document.addEventListener('click', onClick, true);
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();
  return () => {
    for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}
