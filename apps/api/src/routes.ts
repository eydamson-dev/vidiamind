import { FastifyInstance, FastifyPluginOptions } from 'fastify';
// 🛑 FIX: Import the utility class/object from the package 
import { YoutubeTranscript } from 'youtube-transcript'; 

// This is the first route for fetching and processing a YouTube video
async function videoRoutes(fastify: FastifyInstance, options: FastifyPluginOptions) {
  
  // Endpoint to handle the URL input and trigger the full AI pipeline
  fastify.post('/process-video', async (request, reply) => {
    // We assume the request body has a url property: { url: string }
    const { url } = request.body as { url: string };

    if (!url) {
      return reply.code(400).send({ message: 'Missing YouTube URL' });
    }

    try {
      // 1. AUTOMATED TRANSCRIPT RETRIEVAL
      // 🛑 FIX: Access the static method via the imported object/class
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      
      // 2. Placeholder for AI Pipeline (to be implemented next)
      //    - Vectorization/Embedding of the transcript
      //    - Storage in MongoDB
      //    - Summarization via LLM
      
      // 3. Simple response for now (confirming transcript retrieval works)
      return { 
        success: true, 
        message: 'Transcript fetched. AI pipeline pending.',
        transcriptLength: transcript.length,
        videoId: new URL(url).searchParams.get('v')
      };

    } catch (error) {
      request.log.error(error);
      // Log the specific error to the console for easier debugging
      console.error("Transcript retrieval error:", error); 
      return reply.code(500).send({ message: 'Failed to process video or retrieve transcript.' });
    }
  });

  // Placeholder for the Q&A endpoint
  fastify.post('/ask', async (request, reply) => {
    // This will handle the Hybrid RAG logic
    return { message: 'Q&A endpoint ready to implement RAG pipeline.' };
  });
}

export default videoRoutes;
