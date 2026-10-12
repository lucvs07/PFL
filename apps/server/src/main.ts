import { parseCorsOrigin } from './config';
import { createPflServer } from './server';

const port = Number(process.env.PORT ?? 3001);
process.on('uncaughtException', (err) => {
  console.error('[pfl] exceção não tratada', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[pfl] promessa rejeitada sem tratamento', err);
});

const corsOrigin = parseCorsOrigin(process.env.CORS_ORIGIN);
const server = await createPflServer({ port, corsOrigin });
console.log(`PFL server em http://localhost:${server.port}`);
console.log(`Origens aceitas: ${corsOrigin === true ? 'qualquer uma (CORS_ORIGIN vazio)' : [corsOrigin].flat().join(', ')}`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
