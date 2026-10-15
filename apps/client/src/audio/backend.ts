export type Wave = 'square' | 'triangle' | 'noise';
export type Channel = 'music' | 'sfx';

export interface Tone {
  wave: Wave;
  /** onda quadrada: ciclo de trabalho de 0 a 1 */
  duty?: number;
  /** Hz; no ruído, a frequência central do filtro passa-faixa */
  freq: number;
  /** Hz final do glissando (exponencial) */
  freqEnd?: number;
  /** instante absoluto no relógio do backend, em segundos */
  start: number;
  duration: number;
  /** 0 a 1, antes dos ganhos do mixer */
  gain: number;
}

export interface AudioBackend {
  /** falso quando o navegador não oferece Web Audio */
  readonly available: boolean;
  /** relógio do contexto, em segundos (0 enquanto não houver contexto) */
  readonly currentTime: number;
  /** o contexto existe e está tocando */
  readonly running: boolean;
  /** cria o contexto, se preciso, e o retoma. Só pode ser chamado dentro de um gesto do usuário */
  resume(): void;
  setGain(node: 'master' | Channel, value: number, rampSeconds: number): void;
  /** fade do trecho de música atual, separado do volume do jogador */
  fadeMusic(value: number, seconds: number): void;
  /**
   * Começa uma faixa num barramento de fade novo e cheio. As notas longas da faixa anterior seguem no
   * barramento antigo (já em fade-out) e não vazam para a nova.
   */
  newMusicBus(): void;
  playTone(channel: Channel, tone: Tone): void;
}
