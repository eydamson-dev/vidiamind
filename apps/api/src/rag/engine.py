# apps/api/src/rag/engine.py

import os
from llama_index.core import SummaryIndex, VectorStoreIndex, Document, Settings, StorageContext
from llama_index.core.base.embeddings.base import similarity
from llama_index.core.chat_engine.types import ChatMode
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from llama_index.storage.chat_store.mongo import MongoChatStore
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from pymongo import MongoClient

class VidiaMindRAG:
    def __init__(self):
        # Hardware Configuration (Ollama on 1660 Super)
        ollama_host = os.getenv("OLLAMA_HOST", "http://ollama:11434")
        Settings.llm = Ollama(model="llama3.1", base_url=ollama_host, request_timeout=120.0)
        Settings.embed_model = OllamaEmbedding(model_name="nomic-embed-text", base_url=ollama_host)

        # Database Connection
        self.client = MongoClient(os.getenv("MONGODB_URI"))
        self.db_name = os.getenv("DB_NAME", "vidiamind")
        
        # 1. Vector Store Setup
        self.vector_store = MongoDBAtlasVectorSearch(
            self.client,
            db_name=self.db_name,
            collection_name="video_vectors",
            vector_index_name="video_index"
        )
        
        # 2. Chat Persistence Setup
        self.chat_store = MongoChatStore(
            mongo_client=self.client,
            db_name=self.db_name,
            collection_name="chat_history"
        )

    async def ingest_transcript(self, video_id: str, transcript: str) -> str:
        # Save transcript with metadata for filtering
        doc = Document(text=transcript, metadata={"video_id": video_id})
        storage_context = StorageContext.from_defaults(vector_store=self.vector_store)
        
        # Generate the vector index
        _ = VectorStoreIndex.from_documents([doc], storage_context=storage_context)

        summary_index = SummaryIndex.from_documents([doc])
        query_engine = summary_index.as_query_engine(response_mode="simple_summarize")
        
        # Generate initial summary
        summary = str(query_engine.query("Summarize this video in 3 sentences."))
        
        # Prime the conversation history with the summary
        from llama_index.core.base.llms.types import ChatMessage, MessageRole
        
        initial_msg = ChatMessage(role=MessageRole.ASSISTANT, content=f"**Summary:** {summary}")
        self.chat_store.set_messages(video_id, [initial_msg])
        
        return summary

    async def chat(self, video_id: str, message: str) -> dict[str, any]:
        # Initialize memory with the video's unique ID
        memory = ChatMemoryBuffer.from_defaults(
            token_limit=3000, 
            chat_store=self.chat_store, 
            chat_store_key=video_id
        )

        index = VectorStoreIndex.from_vector_store(self.vector_store)
        
        # The 'context' mode ensures the AI focuses on the transcript
        chat_engine = index.as_chat_engine(
            chat_mode=ChatMode.CONTEXT,
            memory=memory,
            system_prompt=f"You are an AI assistant for VidiaMind. Use the transcript of video {video_id} to answer."
        )

        response = chat_engine.chat(message)
        
        # Return answer and the updated history
        return {
            "answer": response.response,
            "history": [msg.dict() for msg in self.chat_store.get_messages(video_id)]
        }
