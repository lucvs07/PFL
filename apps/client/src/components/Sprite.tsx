import { useEffect, useState } from 'react';
import { spriteSrc } from '../lib/sprites';
import { speciesName } from '../lib/names';
import './ui.css';

interface Props {
  id: number;
  view?: 'front' | 'back';
  size?: number;
}

/** Sprite Gen 1 Yellow servido localmente; se faltar (sprites não baixados), mostra as iniciais. */
export function Sprite({ id, view = 'front', size = 40 }: Props) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [id, view]);
  const name = speciesName(id);
  if (failed) {
    return (
      <span className="sprite sprite-missing" style={{ width: size, height: size }} title={name}>
        {name.slice(0, 2)}
      </span>
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
