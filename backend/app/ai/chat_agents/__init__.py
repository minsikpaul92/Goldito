"""The chat AI's two agents (#226): one for the owner's side, one for the sitter's. Each owns its prompts, the facts it
may see, its voice, its model name and its checks; the router only loads the chat and calls the right one."""

from app.ai.chat_agents.base import ChatAgent
from app.ai.chat_agents.owner import OWNER_STYLE, OwnerAgent
from app.ai.chat_agents.sitter import SitterAgent

__all__ = ["OWNER_STYLE", "ChatAgent", "OwnerAgent", "SitterAgent", "agent_for"]


def agent_for(role: str) -> ChatAgent:
    return OwnerAgent() if role == "owner" else SitterAgent()
