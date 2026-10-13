import { useEffect, useState } from 'react';
import { animatedSpriteSrc, spriteSrc } from '../lib/sprites';
import { speciesName } from '../lib/names';
import './ui.css';

interface Props {
  id: number;
  view?: 'front' | 'back';
  size?: number;
  /** GIF animado de frente (Pokédex). Cai no PNG se o GIF faltar e fica estático com movimento reduzido. */
  animated?: boolean;
}

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Sprite Gen 5 Black/White servido localmente; se faltar (sprites não baixados), mostra as iniciais. */
export function Sprite({ id, view = 'front', size = 48, animated = false }: Props) {
  const [failed, setFailed] = useState(false);
  const [animFailed, setAnimFailed] = useState(false);
  // O GIF vem recortado e com tamanho próprio (até 128 px). Mesma escala inteira para todos, a dos PNGs de 96 px, para manter o tamanho relativo entre espécies.
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    setFailed(false);
    setAnimFailed(false);
    setNatural(null);
  }, [id, view]);
  const useAnimated = animated && view === 'front' && !animFailed && !prefersReducedMotion();
  const name = speciesName(id);
  if (failed) {
    return (
      <span className="sprite sprite-missing" style={{ width: size, height: size }} title={name}>
        {name.slice(0, 2)}
      </span>
    );
  }
  if (useAnimated) {
    const scale = Math.max(1, Math.round(size / 96));
    return (
      <img
        className="sprite sprite-animated"
        src={animatedSpriteSrc(id)}
        alt={name}
        title={name}
        style={natural ? { width: natural.w * scale, height: natural.h * scale } : { visibility: 'hidden' }}
        onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        onError={() => setAnimFailed(true)}
      />
    );
  }
  return (
    <img
      className="sprite"
      src={spriteSrc(view, id)}
      alt={name}
      title={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
