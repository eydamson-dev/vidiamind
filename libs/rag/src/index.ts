import {
  VectorStoreIndex,
  storageContextFromDefaults,
  Document,
  Settings,
} from 'llamaindex';

import { MongoDBAtlasVectorSearch } from '@llamaindex/mongodb';
import { DeepSeekLLM } from '@llamaindex/deepseek';
import { OpenAIEmbedding } from '@llamaindex/openai';
import { MongoClient } from 'mongodb';

/**
 * VidiaMindRAG handles the heavy lifting of video knowledge extraction.
 */
export class VidiaMindRAG {
  private vectorStore: MongoDBAtlasVectorSearch;

  constructor(
    mongoClient: MongoClient,
    dbName: string,
    collectionName: string,
  ) {
    // 1. Initialize DeepSeek as the primary intelligence (LLM)
    Settings.llm = new DeepSeekLLM({
      model: 'deepseek-chat', // or "deepseek-reasoner" for R1
      apiKey: process.env.DEEPSEEK_API_KEY,
    });

    // 2. Initialize OpenAI for Embeddings
    Settings.embedModel = new OpenAIEmbedding({
      model: 'text-embedding-3-small',
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 3. Configure MongoDB Vector Store
    this.vectorStore = new MongoDBAtlasVectorSearch({
      mongodbClient: mongoClient,
      dbName: dbName,
      collectionName: collectionName,
      indexName: 'vector_index',
    });
  }

  /**
   * Ingests a transcript into the vector database.
   */
  async ingestTranscript(videoId: string, transcript: string) {
    const document = new Document({
      text: transcript,
      metadata: { videoId, timestamp: new Date().toISOString() },
    });

    const storageContext = await storageContextFromDefaults({
      vectorStore: this.vectorStore,
    });

    // Indexes the document (automatically chunks and embeds)
    await VectorStoreIndex.fromDocuments([document], { storageContext });

    return { success: true, videoId };
  }

  /**
   * Queries the knowledge base for a specific video.
   */
  async ask(videoId: string, question: string) {
    const index = await VectorStoreIndex.fromVectorStore(this.vectorStore);

    const queryEngine = index.asQueryEngine({
      preFilters: {
        filters: [
          {
            key: 'videoId', // Matches the key in Document metadata
            value: videoId,
            operator: '==', // You can also use FilterOperator.EQ
          },
        ],
      },
      similarityTopK: 3,
    });

    const response = await queryEngine.query({ query: question });
    return response.toString();
  }
}
