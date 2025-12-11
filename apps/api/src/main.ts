// apps/api/src/main.ts

const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3333');
const MONGODB_URI = process.env.MONGODB_URI;

import Fastify from 'fastify';
import cors from '@fastify/cors';
import mongodb from '@fastify/mongodb';
import videoRoutes from './routes'; // <--- NEW IMPORT

const fastify = Fastify({
  logger: true,
});

async function main() {
  // 1. Register CORS Plugin
  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // 2. Register MongoDB Plugin
  await fastify.register(mongodb, {
    forceClose: true,
    url: MONGODB_URI,
    database: 'ai-video-db',
  });

  // 3. Register our API Routes!
  fastify.register(videoRoutes, { prefix: '/api' }); // <--- NEW: REGISTERED ROUTES

  // 4. Register a basic health check route (for testing the connection)
  fastify.get('/api/health', async (request, reply) => {
    // Check if the MongoDB connection is available before accessing it
    if (!fastify.mongo.db) {
      // Return a 503 Service Unavailable if the database is down
      return reply
        .code(503)
        .send({ status: 'error', message: 'Database connection failed' });
    }

    // If available, proceed with the successful response
    return { status: 'ok test', database: fastify.mongo.db.databaseName };
  });

  try {
    const address = await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`API is ready at ${address}/api/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
