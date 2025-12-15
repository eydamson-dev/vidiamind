// apps/api/src/main.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { MongoClient } from 'mongodb';
import { VidiaMindRAG } from '@vidiamind/rag';
import { fetchAndFormatTranscript } from './services/youtube.service';

const fastify = Fastify({
  logger: true,
});

const DB_NAME = process.env.DB_NAME || 'vidiamind';
const MONGODB_URI =
  process.env.MONGODB_URI || `mongodb://mongodb:27017/${DB_NAME}`;
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'vectors';

console.log({ DB_NAME, MONGODB_URI, COLLECTION_NAME });

// Helper function to extract YouTube video ID from a URL
function getYouTubeVideoId(url: string): string | null {
  const regex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function bootstrap() {
  try {
    // 2. Register Middleware
    await fastify.register(cors, {
      origin: '*', // Adjust for production
    });

    // 3. Initialize MongoDB Client (Shared Singleton)
    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    fastify.log.info('Connected to MongoDB');

    // 4. Initialize the RAG Service
    const rag = new VidiaMindRAG(mongoClient, DB_NAME, COLLECTION_NAME);

    // --- ROUTES ---

    // Health Check
    fastify.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    /**
     * POST /api/ingest
     * Logic: Receives a video transcript and stores it in the vector database.
     */
    fastify.post('/api/ingest', async (request, reply) => {
      const { videoId, transcript } = request.body as {
        videoId: string;
        transcript: string;
      };

      if (!videoId || !transcript) {
        return reply
          .status(400)
          .send({ error: 'Missing videoId or transcript' });
      }

      try {
        const result = await rag.ingestTranscript(videoId, transcript);
        return reply.status(201).send(result);
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'Failed to ingest transcript' });
      }
    });

    /**
     * POST /api/ask
     * Logic: Queries DeepSeek using RAG for a specific video.
     */
    fastify.post('/api/ask', async (request, reply) => {
      const { videoId, question } = request.body as {
        videoId: string;
        question: string;
      };

      if (!videoId || !question) {
        return reply.status(400).send({ error: 'Missing videoId or question' });
      }

      try {
        const answer = await rag.ask(videoId, question);
        return { answer };
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({ error: 'DeepSeek RAG query failed' });
      }
    });

    fastify.post('/api/process-video', async (request, reply) => {
      const { url } = request.body as { url: string };
      if (!url) {
        return reply.status(400).send({ error: 'Missing Youtube URL' });
      }

      const videoId = getYouTubeVideoId(url);

      if (!videoId) {
        return reply
          .status(400)
          .send({ error: 'Invalid Youtube URL provided' });
      }

      try {
        const transcript = await fetchAndFormatTranscript(videoId);
        const result = await rag.ingestTranscript(videoId, transcript);

        return reply.status(202).send({
          ...result,
          message: `Video ID ${videoId} submitted for RAG indexing.`,
          videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        });
      } catch (error: any) {
        fastify.log.error(error);
        return reply.status(500).send({
          error:
            error.message ||
            'Failed to process video: Transcript issue or RAG failure.',
        });
      }
    });

    // 5. Start the Server
    const port = Number(process.env.PORT) || 3333;
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
