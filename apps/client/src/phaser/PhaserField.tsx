import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { Stage } from '../match/matchState';
import { FieldScene, type PlaySpec } from './FieldScene';
import { FIELD_HEIGHT, FIELD_WIDTH } from './layout';
import './phaser-field.css';

interface Props {
  stage: Stage | null;
  play: PlaySpec | null;
}

/** Monta um Phaser.Game por instância e repassa estágio/animação à cena. */
export function PhaserField({ stage, play }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<FieldScene | null>(null);
  const latest = useRef<Props>({ stage, play });
  latest.current = { stage, play };

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let game: Phaser.Game | null = null;
    // O Phaser rasteriza o texto ao criá-lo; sem as fontes carregadas ele cairia na monoespaçada.
    const loadFonts = async () => {
      try {
        await Promise.all([document.fonts.load('8px "Press Start 2P"'), document.fonts.load('10px "Pixelify Sans"')]);
      } catch {
        // segue mesmo assim com a fonte reserva
      }
    };
    void loadFonts().then(() => {
      if (cancelled) return;
      const scene = new FieldScene();
      game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host,
        width: FIELD_WIDTH,
        height: FIELD_HEIGHT,
        pixelArt: true,
        backgroundColor: '#48a058',
        banner: false,
        audio: { noAudio: true },
        scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
        scene,
      });
      sceneRef.current = scene;
      scene.sync(latest.current.stage, latest.current.play);
    });
    return () => {
      cancelled = true;
      sceneRef.current = null;
      game?.destroy(true);
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.sync(stage, play);
  }, [stage, play]);

  return <div className="phaser-field" ref={hostRef} aria-label="Campo" role="img" />;
}
