# apps/api/src/rag/engine.py

import logging
import os

from llama_index.core import (
    Document,
    DocumentSummaryIndex,
    Settings,
    StorageContext,
    VectorStoreIndex,
    get_response_synthesizer,
)
from llama_index.core.base.llms.types import ChatMessage, MessageRole
from llama_index.core.base.response.schema import RESPONSE_TYPE
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.response_synthesizers.type import ResponseMode
from llama_index.core.schema import NodeWithScore
from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama
from llama_index.storage.chat_store.mongo import MongoChatStore
from llama_index.vector_stores.mongodb import MongoDBAtlasVectorSearch
from pymongo import MongoClient
from src.core.config import settings

logging.basicConfig(level=logging.INFO)

QUERY_STRING = "Your are an ai chat assistant. You will provide a detailed summary of the video based on its transcript, around 3-5 sentence or more, add bullet points if needed"

class VidiaMindRAG:
    def __init__(self):
        ollama_host = settings.OLLAMA_HOST
        Settings.llm = Ollama(
            model=settings.LLM_MODEL,
            base_url=ollama_host,
            request_timeout=600.0,
            context_window=8192,
        )
        # Settings.llm = OpenRouter(
        #     model=settings.OPENROUTER_MODEL, api_key=settings.OPENROUTER_API_KEY
        # )
        Settings.embed_model = OllamaEmbedding(
            model_name=settings.EMBED_MODEL, base_url=ollama_host
        )

        # Database Connection
        self.client = MongoClient(settings.MONGODB_URI)
        self.db_name = settings.DB_NAME

        # 1. Vector Store Setup
        self.vector_store = MongoDBAtlasVectorSearch(
            self.client,
            db_name=self.db_name,
            collection_name="video_vectors",
            vector_index_name="video_index",
        )

        # 2. Chat Persistence Setup
        self.chat_store = MongoChatStore(
            mongo_client=self.client,
            db_name=self.db_name,
            collection_name="chat_history",
        )

        self.splitter = SentenceSplitter(chunk_size=2048, chunk_overlap=100)

    async def ingest_transcript(self, video_id: str, transcript: str) -> None:
        print("text is:")
        print(transcript)
        # Save transcript with metadata for filtering
        doc = Document(text=transcript, metadata={"video_id": video_id})
        nodes = self.splitter.get_nodes_from_documents([doc])

        storage_context = StorageContext.from_defaults(vector_store=self.vector_store)

        # Generate the vector index
        _ = VectorStoreIndex(
            nodes,
            storage_context=storage_context,
            show_progress=True,
            insert_batch_size=512,
        )

    async def useSummaryIndex(self, doc: Document) -> RESPONSE_TYPE:
        synthesizer = get_response_synthesizer(response_mode=ResponseMode.COMPACT)
        index = DocumentSummaryIndex.from_documents(
            [doc],
            transformations=[self.splitter],
            response_synthesizer=synthesizer,
            show_progress=True,
        )

        quiery_engine = index.as_query_engine(
            response_mode=ResponseMode.TREE_SUMMARIZE, use_async=True
        )

        return await quiery_engine.aquery(QUERY_STRING)

    async def useSynthesizer(self, doc: Document) -> RESPONSE_TYPE:
        synthesizer = get_response_synthesizer(response_mode=ResponseMode.COMPACT)
        nodes = self.splitter.get_nodes_from_documents([doc])
        nodes_with_score = [NodeWithScore(node=node, score=1.0) for node in nodes]
        print("nodes (wrapped): ", nodes_with_score)
        return await synthesizer.asynthesize(query=QUERY_STRING, nodes=nodes_with_score)

    async def generate_summary(self, video_id: str, transcript: str) -> str:
        """Tree based summarization. Safe for long transcripts"""
        # logging.info("Generating summary for transcript=%s", transcript)
        doc = Document(text=transcript, metadata={"video_id": video_id})
        response_query = await self.useSynthesizer(doc)
        summary = str(response_query)

        print(f"Summary generated for {video_id}:")
        print(summary)
        # Check if the LLM actually returned text
        if (
            not summary
            or summary.lower() == "none"
            or "empty response" in summary.lower()
        ):
            logging.warning(
                f"LLM returned an empty summary for {video_id}. Checking source nodes..."
            )
            # Debug: Check if nodes were actually retrieved
            if (
                hasattr(response_query, "source_nodes")
                and not response_query.source_nodes
            ):
                return "Error: No text chunks were retrieved for summarization."
            return "Error: LLM failed to generate a summary. Check your OpenRouter credits/model name."

        initial_msg = ChatMessage(
            role=MessageRole.ASSISTANT, content=f"**Summary:**\n{summary}"
        )
        self.chat_store.set_messages(video_id, [initial_msg])

        return summary
