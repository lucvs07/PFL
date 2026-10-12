import './match.css';

export function ConversionPicker({ onPick }: { onPick: (choice: 'PAT' | 'TWO') => void }) {
  return (
    <div className="picker picker-conversion">
      <button type="button" className="picker-option" onClick={() => onPick('PAT')}>
        <span className="picker-title">PAT</span>
        <span className="picker-desc">1 ponto · chute quase automático do especialista</span>
      </button>
      <button type="button" className="picker-option" onClick={() => onPick('TWO')}>
        <span className="picker-title">Conversão de 2</span>
        <span className="picker-desc">uma jogada normal a partir da linha de 3</span>
      </button>
    </div>
  );
}
