# apps/api/src/main.py

import logging
import uvicorn
from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
from youtube_transcript_api.formatters import TextFormatter

from src.core.config import settings
from src.rag.engine import VidiaMindRAG

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="VidiaMind API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

rag = VidiaMindRAG()

class VideoRequest(BaseModel):
    url: str

def extract_video_id(url: str) -> str | None:
    """Simple extraction for standard and shortened YouTube URLs."""
    import re
    reg = r"(?:v=|\/)([0-9A-Za-z_-]{11}).*"
    match = re.search(reg, url)
    return match.group(1) if match else None

@app.get("/health")
def health_check():
    return {"status": "healthy", "model": settings.LLM_MODEL}

@app.post("/api/process-video")
async def process_video(req: VideoRequest, background_task: BackgroundTasks):
    video_id = extract_video_id(req.url)
    
    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    try:
        ytt_api = YouTubeTranscriptApi()
        transcript_data = ytt_api.fetch(video_id)
        logging.info({'transcript_data':transcript_data})
        
        # Use the built-in TextFormatter to turn the list into a clean paragraph
        formatter = TextFormatter()
        full_text = formatter.format_transcript(transcript_data)
        
        await rag.ingest_transcript(video_id, full_text)

        background_task.add_task(rag.generate_summary, video_id, full_text)
        
        return {
            "videoId": video_id,
            "summary": "processing",
            "status": "success"
        }

    except TranscriptsDisabled:
        raise HTTPException(status_code=404, detail="Subtitles are disabled for this video.")
    except NoTranscriptFound:
        raise HTTPException(status_code=404, detail="No English or Filipino transcript found.")
    except Exception as e:
        # Log the error for debugging
        print(f"Error processing video {video_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error during processing.")

if __name__ == "__main__":
    uvicorn.run("src.main:app", host=settings.HOST, port=settings.PORT, reload=True)
