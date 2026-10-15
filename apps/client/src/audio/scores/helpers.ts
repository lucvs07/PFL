// Montadores de compassos de 16 posições (semicolcheias).
const repeat = (tokens: readonly string[], times: number): string[] => Array.from({ length: times }, () => tokens).flat();

/** arpejo em semicolcheias: a b c b, quatro vezes */
export const arp16 = (a: string, b: string, c: string): string => repeat([a, b, c, b], 4).join(' ');
/** arpejo em colcheias: a . b . c . b ., duas vezes */
export const arp8 = (a: string, b: string, c: string): string => repeat([a, '.', b, '.', c, '.', b, '.'], 2).join(' ');
/** baixo de duas notas, cada uma sustentada por meio compasso */
export const bass2 = (a: string, b: string): string => [a, ...repeat(['-'], 7), b, ...repeat(['-'], 7)].join(' ');
/** baixo pulsante em colcheias */
export const bass8 = (root: string): string => repeat([root, '-'], 8).join(' ');
/** uma nota sustentada pelo compasso inteiro */
export const hold = (note: string): string => [note, ...repeat(['-'], 15)].join(' ');
/** o mesmo compasso repetido */
export const bars = (bar: string, times: number): string[] => repeat([bar], times);
