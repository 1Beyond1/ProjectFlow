from fastapi import APIRouter

router = APIRouter(prefix="/api/chat", tags=["chat"])


@router.get("/health")
async def chat_health():
    return {"status": "ok"}
