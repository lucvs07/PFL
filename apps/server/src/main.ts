import { parseCorsOrigin } from './config';
import { createPflServer } from './server';

const port = Number(process.env.PORT ?? 3001);
process.on('uncaughtException', (err) => {
  console.error('[pfl] exceção não tratada', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[pfl] promessa rejeitada sem tratamento', err);
});

const server = await createPflServer({ port, corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN) });
console.log(`PFL server em http://localhost:${server.port}`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
