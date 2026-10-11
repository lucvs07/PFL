import { pathToFileURL } from 'node:url';
import { MAX_SEED, runSim } from './runner';
import { DEFAULT_GATE, MIN_SAMPLED_CARDS, balanceGate, buildReport, formatReport } from './report';

export interface CliOptions {
  games: number;
  seed: number;
  minSample: number;
  gate: boolean;
}

export const USAGE = 'uso: npm run sim -- --games N [--seed S] [--min-sample M] [--gate]';

function positiveInt(flag: string, raw: string | undefined, allowZero = false, max = Number.MAX_SAFE_INTEGER): number {
  const n = Number(raw);
  if (raw === undefined || !/^\d+$/.test(raw) || n < (allowZero ? 0 : 1) || n > max) {
    const range = allowZero ? `entre 0 e ${max}` : 'positivo';
    throw new Error(`${flag} precisa de um inteiro ${range} (recebido: ${raw ?? 'nada'})\n${USAGE}`);
  }
  return n;
}

/** Aceita `--opção valor` e `--opção=valor`. */
function normalize(argv: readonly string[]): string[] {
  return argv.flatMap((a) => {
    const eq = a.startsWith('--') ? a.indexOf('=') : -1;
    return eq > 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a];
  });
}

export function parseArgs(input: readonly string[]): CliOptions {
  const argv = normalize(input);
  const options: CliOptions = { games: 0, seed: 1, minSample: DEFAULT_GATE.minSample, gate: false };
  const seen = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (['--games', '--seed', '--min-sample', '--gate'].includes(flag)) {
      if (seen.has(flag)) throw new Error(`${flag} repetido\n${USAGE}`);
      seen.add(flag);
    }
    switch (flag) {
      case '--games':
        options.games = positiveInt(flag, argv[++i]);
        break;
      case '--seed':
        options.seed = positiveInt(flag, argv[++i], true, MAX_SEED);
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
  if (!seen.has('--games')) throw new Error(`--games é obrigatório\n${USAGE}`);
  return options;
}

/**
 * Devolve o código de saída: 0 ok; 1 portão reprovado (com --gate); 2 argumentos inválidos;
 * 3 amostra insuficiente para o portão (com --gate); 4 erro de execução da simulação.
 */
export function main(
  argv: readonly string[],
  out: (line: string) => void = console.log,
  err: (line: string) => void = console.error,
  simulate: typeof runSim = runSim,
): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    out(USAGE);
    return 0;
  }
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (e) {
    err((e as Error).message);
    return 2;
  }
  const started = Date.now();
  let report: ReturnType<typeof buildReport>;
  try {
    report = buildReport(simulate({ games: options.games, seed: options.seed }));
  } catch (e) {
    err(`erro na simulação: ${(e as Error).message}`);
    return 4;
  }
  const gate = balanceGate(report, { ...DEFAULT_GATE, minSample: options.minSample });
  out(formatReport(report, gate));
  out(`Seed ${options.seed}, amostra mínima ${options.minSample}, ${((Date.now() - started) / 1000).toFixed(1)} s`);
  if (!options.gate) return 0;
  if (gate.failures.length > 0) return 1;
  if (gate.sampled.length < MIN_SAMPLED_CARDS) {
    err(`amostra insuficiente: só ${gate.sampled.length} cartas com ≥ ${options.minSample} jogos (mínimo ${MIN_SAMPLED_CARDS}); aumente --games`);
    return 3;
  }
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
