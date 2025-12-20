// libs/rag/src/index.ts

import {
  Document,
  Settings,
  storageContextFromDefaults,
  VectorStoreIndex,
} from 'llamaindex';

import { Ollama, OllamaEmbedding } from '@llamaindex/ollama';
import { MongoClient } from 'mongodb';
import { MongoDBAtlasVectorSearch } from '@llamaindex/mongodb';


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
    const ollamaHost = process.env.OLLAMA_HOST
    const llmModel = process.env.LLM_MODEL
    const embedModel = process.env.EMBED_MODEL

    if (!ollamaHost || !llmModel || !embedModel) throw new Error('Env not configured');

    Settings.llm = new Ollama({
      model: llmModel,
      config: {
        host: ollamaHost,
      },
    });

    Settings.embedModel = new OllamaEmbedding({
      model: embedModel,
      config: {
        host: ollamaHost,
      },
    });

    this.vectorStore = new MongoDBAtlasVectorSearch({
      mongodbClient: mongoClient,
      autoCreateIndex: false,
      dbName: dbName,
      collectionName: collectionName,
      indexName: 'video_index',
    });
  }

  /**
   * Ingests a transcript into the vector database.
   */
  async ingestTranscript(videoId: string, transcript: string) {
    const document = new Document({
      text: transcript,
      metadata: {
        videoId,
      },
    });

    const storageContext = await storageContextFromDefaults({
      vectorStore: this.vectorStore,
    });

    await VectorStoreIndex.fromDocuments([document], { storageContext });

    return { success: true, videoId };
  }

  /**
   * Queries the knowledge base for a specific video.
   */
  async ask(videoId: string, question: string) {
    const index = VectorStoreIndex.fromVectorStore(this.vectorStore)

    const queryEngine = (await index).asQueryEngine({
      preFilters: {
        filters: [{key: 'metadata.videoId', value: videoId, operator: "=="}]
      },
      similarityTopK: 3
    })

    const response = await queryEngine.query({query: question})
    return response.toString()
  }
}
