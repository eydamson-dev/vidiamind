// apps/api/src/main.ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { MongoClient } from 'mongodb';
import { VidiaMindRAG } from '@vidiamind/rag';
import { fetchAndFormatTranscript } from './services/youtube.service';

interface AskRequest {
  videoId: string;
  question: string;
}

interface ProcessVideoRequest {
  url: string;
}

const fastify = Fastify({
  logger: true,
});

const DB_NAME = process.env.DB_NAME || 'vidiamind';
const MONGODB_URI =
  process.env.MONGODB_URI || `mongodb://mongodb:27017/${DB_NAME}`;
const COLLECTION_NAME = process.env.COLLECTION_NAME || 'vectors';

// Helper function to extract YouTube video ID from a URL
function getYouTubeVideoId(url: string): string | null {
  const regex =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function bootstrap() {
  try {
    await fastify.register(cors, {
      origin: '*', // Adjust for production
    });

    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    fastify.log.info('Connected to MongoDB');

    const rag = new VidiaMindRAG(mongoClient, DB_NAME, COLLECTION_NAME);

    // --- ROUTES ---

    // Health Check
    fastify.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    /**
     * POST /api/ask
     * Logic: Queries DeepSeek using RAG for a specific video.
     */
    fastify.post<{ Body: AskRequest }>('/api/ask', async (request, reply) => {
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

    /**
     * POST: /api/process-video
     * Logic: takes the Youtuve video id and fetch the transcript from YT then ingest on the rag service
     */
    fastify.post<{ Body: ProcessVideoRequest }>(
      '/api/process-video',
      async (request, reply) => {
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

          // Note: For very long videos, this might take > 30s.
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
      },
    );

    // Shutdown services
    const closeHandlers = async () => {
      fastify.log.info('Closing connections...');
      await mongoClient.close();
      await fastify.close();
      process.exit(0);
    };

    process.on('SIGINT', closeHandlers);
    process.on('SIGTERM', closeHandlers);

    const port = Number(process.env.PORT) || 3333;
    await fastify.listen({ port, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

bootstrap();
