from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import pool
from app.routers import auth, debug, drafts, evals, health, knowledge, prompts, tickets, users


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open(wait=True)
    yield
    pool.close()


app = FastAPI(title="Agent Service Desk API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(debug.router)
app.include_router(tickets.router, prefix="/tickets", tags=["tickets"])
app.include_router(knowledge.router, prefix="/knowledge", tags=["knowledge"])
app.include_router(drafts.router, prefix="/drafts", tags=["drafts"])
app.include_router(evals.router, prefix="/eval", tags=["evals"])
app.include_router(prompts.router, prefix="/prompt-versions", tags=["prompts"])
app.include_router(users.router, prefix="/users", tags=["users"])
