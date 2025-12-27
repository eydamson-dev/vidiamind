# apps/api/src/rag/engine.py

import os
import logging
from llama_index.core import SummaryIndex, VectorStoreIndex, Document, Settings, StorageContext
from llama_index.core.base.embeddings.base import similarity
from llama_index.core.chat_engine.types import ChatMode
from llama_index.core.node_parser import SentenceSplitter
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from llama_index.storage.chat_store.mongo import MongoChatStore
from llama_index.core.memory import ChatMemoryBuffer
from llama_index.llms.ollama import Ollama
from llama_index.embeddings.ollama import OllamaEmbedding
from pymongo import MongoClient
from llama_index.core.base.llms.types import ChatMessage, MessageRole
from llama_index.llms.openrouter import OpenRouter
logging.basicConfig(level=logging.INFO)

class VidiaMindRAG:
    def __init__(self):
        # Hardware Configuration (Ollama on 1660 Super)
        ollama_host = os.getenv("OLLAMA_HOST", "http://ollama:11434")
        #Settings.llm = Ollama(model="llama3.1", base_url=ollama_host, request_timeout=600.0)
        Settings.llm = OpenRouter(model=os.getenv('OPEN_ROUTER_MODEL', 'tngtech/deepseek-r1t2-chimera:free'), api_key=os.getenv('OPENROUTER_API_KEY'))
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

        self.splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)

    async def ingest_transcript(self, video_id: str, transcript: str) -> None:
        # Save transcript with metadata for filtering
        doc = Document(text=transcript, metadata={"video_id": video_id})
        nodes = self.splitter.get_nodes_from_documents([doc])

        storage_context = StorageContext.from_defaults(vector_store=self.vector_store)
        
        # Generate the vector index
        _ = VectorStoreIndex(nodes, storage_context=storage_context)

    async def generate_summary(self, video_id: str, transcript: str) -> str:
        """Tree based summarization. Safe for long transcripts"""
        doc = Document(text=transcript,metadata={"video_id": video_id})
        nodes = self.splitter.get_nodes_from_documents([doc])
        summary_index = SummaryIndex(nodes)
        query_engine = summary_index.as_query_engine(response_mode="tree_summarize")
        logging.info({'full_text': transcript})
        # Generate initial summary
        summary = str(query_engine.query("Summarize this video in 3 sentences."))
        logging.info('\nGenerated summary is ', summary)
        
        initial_msg = ChatMessage(role=MessageRole.ASSISTANT, content=f"**Summary:**\n{summary}")
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
