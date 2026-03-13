from pydantic import BaseModel


class PaginationParams(BaseModel):
    page: int = 1
    per_page: int = 25  # max 100


class PaginatedResponse(BaseModel):
    items: list  # overridden in specific responses
    total: int
    page: int
    per_page: int
    total_pages: int
