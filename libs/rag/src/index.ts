// libs/rag/src/index.ts

import * as llamaindex from 'llamaindex';

const { Settings } = llamaindex;

import { OpenAI } from '@llamaindex/openai';
import { Collection, MongoClient } from 'mongodb';

/**
 * VidiaMindRAG handles the heavy lifting of video knowledge extraction.
 */
export class VidiaMindRAG {
  private collection: Collection;

  constructor(
    mongoClient: MongoClient,
    dbName: string,
    collectionName: string,
  ) {

    Settings.llm = new OpenAI({
      baseURL: process.env.OPENAI_BASE_URL,
      apiKey: process.env.OPENROUTER_API_KEY,
      model: process.env.OPENROUTER_MODEL,
    });

    const db = mongoClient.db(dbName);
    this.collection = db.collection(collectionName);
  }

  /**
   * Ingests a transcript into the vector database.
   */
  async ingestTranscript(videoId: string, transcript: string) {
    const chunk = {
      text: transcript,
      videoId,
      timestamp: new Date().toISOString(),
    };

    // Use the native insertOne method
    await this.collection.insertOne(chunk);

    return {
      success: true,
      videoId,
      note: 'Indexed via standard MongoDB Text Search.',
    };
  }

  /**
   * Queries the knowledge base for a specific video.
   */
  async ask(videoId: string, question: string) {
    const filter = {
      $text: {
        $search: question,
      },
      videoId: videoId,
    };

    const projection = {
      _id: 0,
      text: 1,
      score: { $meta: 'textScore' },
    };

    const retrievedDocs = await this.collection
      .find(filter, { projection }) // Pass the filter and the projection as an option object
      .sort({ score: { $meta: 'textScore' } }) // Sort by the calculated score field
      .limit(3) // Limit results to the top 3
      .toArray(); // Execute the query and return the array

    const context = retrievedDocs.map((doc) => doc.text).join('\n---\n');
    const prompt = `Based ONLY on the following context, answer the user's question. Context: ${context}\n\nQuestion: ${question}`;
    const response = await Settings.llm!.chat({
      messages: [{ role: 'user', content: prompt }],
    });

    return response.message.content;
  }
}
