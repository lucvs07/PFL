import type { Team } from '@pfl/engine';

/** Time em montagem: igual a Team, mas o especialista pode faltar. */
export interface TeamDraft {
  name: string;
  roster: number[];
  specialist: number | null;
  depth: Team['depth'];
  keepOnField: number[];
  offenseDeck: string[];
  defenseDeck: string[];
}

export function emptyDraft(name = 'Meu time'): TeamDraft {
  return { name, roster: [], specialist: null, depth: {}, keepOnField: [], offenseDeck: [], defenseDeck: [] };
}

export function draftFromTeam(team: Team): TeamDraft {
  const copy = structuredClone(team);
  return {
    name: copy.name,
    roster: copy.roster,
    specialist: copy.specialist,
    depth: copy.depth,
    keepOnField: copy.keepOnField,
    offenseDeck: copy.offenseDeck,
    defenseDeck: copy.defenseDeck,
  };
}

export function draftToTeam(draft: TeamDraft): Team | null {
  if (draft.specialist === null) return null;
  const copy = structuredClone(draft);
  return {
    name: copy.name,
    roster: copy.roster,
    specialist: draft.specialist,
    depth: copy.depth,
    keepOnField: copy.keepOnField,
    offenseDeck: copy.offenseDeck,
    defenseDeck: copy.defenseDeck,
  };
}
