import { createPflServer } from './server';

const port = Number(process.env.PORT ?? 3001);
const server = await createPflServer({ port });
console.log(`PFL server em http://localhost:${server.port}`);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
