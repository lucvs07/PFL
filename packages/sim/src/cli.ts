import { pathToFileURL } from 'node:url';
import { runSim } from './runner';
import { DEFAULT_GATE, balanceGate, buildReport, formatReport } from './report';

export interface CliOptions {
  games: number;
  seed: number;
  minSample: number;
  gate: boolean;
}

export const USAGE = 'uso: npm run sim -- --games N [--seed S] [--min-sample M] [--gate]';

function positiveInt(flag: string, raw: string | undefined, allowZero = false): number {
  const n = Number(raw);
  if (raw === undefined || raw.startsWith('--') || !Number.isInteger(n) || n < (allowZero ? 0 : 1)) {
    throw new Error(`${flag} precisa de um inteiro ${allowZero ? '≥ 0' : 'positivo'} (recebido: ${raw ?? 'nada'})\n${USAGE}`);
  }
  return n;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { games: 0, seed: 1, minSample: DEFAULT_GATE.minSample, gate: false };
  let sawGames = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--games':
        options.games = positiveInt(flag, argv[++i]);
        sawGames = true;
        break;
      case '--seed':
        options.seed = positiveInt(flag, argv[++i], true);
        break;
      case '--min-sample':
        options.minSample = positiveInt(flag, argv[++i]);
        break;
      case '--gate':
        options.gate = true;
        break;
      default:
        throw new Error(`opção desconhecida: ${flag}\n${USAGE}`);
    }
  }
  if (!sawGames) throw new Error(`--games é obrigatório\n${USAGE}`);
  return options;
}

/** Devolve o código de saída: 0 ok; 1 portão reprovado (com --gate); 2 argumentos inválidos. */
export function main(argv: readonly string[], out: (line: string) => void = console.log, err: (line: string) => void = console.error): number {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (e) {
    err((e as Error).message);
    return 2;
  }
  const started = Date.now();
  const report = buildReport(runSim({ games: options.games, seed: options.seed }));
  const gate = balanceGate(report, { ...DEFAULT_GATE, minSample: options.minSample });
  out(formatReport(report, gate));
  out(`Seed ${options.seed}, amostra mínima ${options.minSample}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  return options.gate && gate.failures.length > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
