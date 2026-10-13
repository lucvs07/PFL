// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { TeamKey } from '@pfl/engine';
import type { RoomPlayer, RoomState } from '@pfl/protocol';
import { LobbyScreen } from '../src/screens/LobbyScreen';
import { speciesName } from '../src/lib/names';
import { testTeam } from './fixtures';

afterEach(cleanup);

const player = (key: TeamKey, over: Partial<RoomPlayer> = {}): RoomPlayer => ({
  key, connected: true, ready: false, teamName: null, teamErrors: [], roster: [], lead: null, cost: null, ...over,
});
const withTeam = (key: TeamKey, roster: number[], lead: number, cost: number, over: Partial<RoomPlayer> = {}): RoomPlayer =>
  player(key, { teamName: `Time ${key}`, roster, lead, cost, ...over });
const room = (players: RoomPlayer[], you: TeamKey = 'A'): RoomState => ({ code: 'KDJJCS', you, status: 'WAITING', players });

function setup(state: RoomState, myTeam = testTeam('Meu time')) {
  const handlers = { onSubmitTeam: vi.fn(), onReady: vi.fn(), onLeave: vi.fn() };
  const view = render(<LobbyScreen room={state} myTeam={myTeam} {...handlers} />);
  return { ...view, ...handlers };
}

const rosterNames = (key: TeamKey): string[] =>
  within(screen.getByLabelText(`Elenco do Jogador ${key}`))
    .getAllByRole('img')
    .map((img) => img.getAttribute('alt') ?? '');

describe('<LobbyScreen> times dos dois jogadores', () => {
  it('mostra o elenco do adversário e o próprio, na ordem enviada', () => {
    setup(room([withTeam('A', [25, 6, 9], 25, 116), withTeam('B', [150, 1], 150, 120)]));
    expect(rosterNames('A')).toEqual([25, 6, 9].map(speciesName));
    expect(rosterNames('B')).toEqual([150, 1].map(speciesName));
  });

  it('o adversário vê o mesmo que o dono (mesmo conteúdo para quem é B)', () => {
    setup(room([withTeam('A', [25, 6], 25, 116), withTeam('B', [150], 150, 120)], 'B'));
    expect(rosterNames('A')).toEqual([25, 6].map(speciesName));
    expect(rosterNames('B')).toEqual([150].map(speciesName));
  });

  it('mostra o sprite de destaque grande e o custo dos dois', () => {
    const { container } = setup(room([withTeam('A', [25, 6], 25, 116), withTeam('B', [150], 150, 120)]));
    const leads = [...container.querySelectorAll('.lobby-lead img')].map((i) => i.getAttribute('alt'));
    expect(leads).toEqual([speciesName(25), speciesName(150)]);
    expect([...container.querySelectorAll('.lobby-cost')].map((e) => e.textContent)).toEqual(['116pt', '120pt']);
  });

  it('time ainda não enviado ou inválido não mostra elenco, destaque nem custo', () => {
    const { container } = setup(
      room([withTeam('A', [25], 25, 116), player('B', { teamName: 'Quebrado', teamErrors: [{ code: 'ROSTER_SIZE' }] })]),
    );
    expect(screen.queryByLabelText('Elenco do Jogador B')).toBeNull();
    expect(container.querySelectorAll('.lobby-lead')).toHaveLength(1);
    expect(container.querySelectorAll('.lobby-cost')).toHaveLength(1);
  });

  it('jogador sem time mostra "sem time"', () => {
    setup(room([player('A'), player('B')]));
    expect(screen.getAllByText('sem time')).toHaveLength(2);
    expect(screen.queryByLabelText('Elenco do Jogador A')).toBeNull();
  });

  it('adversário que ainda não entrou mostra a espera', () => {
    setup(room([withTeam('A', [25], 25, 116)]));
    expect(screen.getByText('Aguardando entrar...')).toBeTruthy();
  });

  it('servidor antigo (sem roster, lead e cost) não quebra nem mostra custo vazio', () => {
    const old = [
      { key: 'A', connected: true, ready: false, teamName: 'Antigo', teamErrors: [] },
      { key: 'B', connected: true, ready: false, teamName: null, teamErrors: [] },
    ] as unknown as RoomPlayer[];
    const { container } = setup(room(old));
    expect(container.textContent).not.toContain('undefined');
    expect(container.querySelectorAll('.lobby-cost')).toHaveLength(0); // sem isso apareceria só "pt"
    expect(container.querySelectorAll('.lobby-roster')).toHaveLength(0);
    expect(screen.getByText('Antigo')).toBeTruthy();
  });
});

describe('<LobbyScreen> ações', () => {
  it('"Estou pronto" só habilita com time válido enviado e alterna o pronto', () => {
    const { onReady, rerender } = setup(room([player('A'), player('B')]));
    const ready = () => screen.getByRole('button', { name: /pronto/i }) as HTMLButtonElement;
    expect(ready().disabled).toBe(true);

    rerender(<LobbyScreen room={room([withTeam('A', [25], 25, 116), player('B')])} myTeam={testTeam()} onSubmitTeam={vi.fn()} onReady={onReady} onLeave={vi.fn()} />);
    expect(ready().disabled).toBe(false);
    fireEvent.click(ready());
    expect(onReady).toHaveBeenLastCalledWith(true);

    rerender(<LobbyScreen room={room([withTeam('A', [25], 25, 116, { ready: true }), player('B')])} myTeam={testTeam()} onSubmitTeam={vi.fn()} onReady={onReady} onLeave={vi.fn()} />);
    expect(ready().textContent).toBe('Cancelar pronto');
    fireEvent.click(ready());
    expect(onReady).toHaveBeenLastCalledWith(false);
  });

  it('time com erros do servidor mantém o pronto desabilitado', () => {
    setup(room([withTeam('A', [25], 25, 116, { teamErrors: [{ code: 'ROSTER_SIZE' }] }), player('B')]));
    expect((screen.getByRole('button', { name: /pronto/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Enviar time" manda o time selecionado (o primeiro da lista por padrão)', () => {
    const { onSubmitTeam } = setup(room([player('A'), player('B')]));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar time' }));
    expect(onSubmitTeam).toHaveBeenCalledTimes(1);
    const team = onSubmitTeam.mock.calls[0][0];
    expect(typeof team.name).toBe('string');
    expect(team.roster.length).toBeGreaterThan(0);
  });

  it('trocar a opção muda o time enviado', () => {
    const { onSubmitTeam } = setup(room([player('A'), player('B')]));
    const radios = screen.getAllByRole('radio');
    expect(radios.length).toBeGreaterThan(1);
    fireEvent.click(radios[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar time' }));
    const second = onSubmitTeam.mock.calls[0][0];
    const label = radios[1].closest('label') as HTMLElement;
    expect(label.textContent).toContain(second.name);
  });

  it('"Sair da sala" chama onLeave e o código da sala aparece', () => {
    const { onLeave } = setup(room([player('A'), player('B')]));
    expect(screen.getByLabelText('Código da sala').textContent).toBe('KDJJCS');
    fireEvent.click(screen.getByRole('button', { name: 'Sair da sala' }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });
});
