import Fastify from 'fastify';
import cors from '@fastify/cors';
import mongodb from '@fastify/mongodb';

// Configuration constants (you will replace this with .env variables later)
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3333');
// Placeholder: Replace with your actual MongoDB connection string
const MONGODB_URI = 'mongodb://localhost:27017/ai-video-db'; 

const fastify = Fastify({
  logger: true,
});

async function main() {
  // 1. Register CORS Plugin
  // This allows the frontend (e.g., running on port 4200) to talk to the backend.
  await fastify.register(cors, {
    // During development, we allow all origins.
    // In production, this must be restricted to your frontend domain!
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  // 2. Register MongoDB Plugin
  // This connects to the database and makes 'fastify.mongo.db' available everywhere.
  await fastify.register(mongodb, {
    forceClose: true, // Ensures connection closes cleanly on server stop
    url: MONGODB_URI,
    database: 'ai-video-db', // The name of our application database
  });

  // 3. Register a basic test route
  fastify.get('/api/health', async (request, reply) => {
    return { status: 'ok', database: fastify.mongo.db.databaseName };
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
