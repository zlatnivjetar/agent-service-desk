from uuid import UUID

from pydantic import BaseModel


class UserListItem(BaseModel):
    id: UUID
    full_name: str
    email: str
    role: str
