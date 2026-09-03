"""Database indexes maintained by the application at startup.

The routine is deliberately idempotent: MongoDB reuses an index when its name
and definition already exist, so it is safe to run on every deployment.
"""
import asyncio

from deps import db, logger


# These fields are used by /api/search either directly or to resolve the
# related client name. They remain regular indexes because the current search
# supports partial matching; a text-search service is not required yet.
SEARCH_INDEXES = {
    "leads": ("id", "description", "client_name_raw", "status", "client_id", "updated_at"),
    "opportunities": ("id", "description", "status", "client_id", "updated_at"),
    "proposals": ("id", "number", "description", "status", "client_id", "updated_at"),
    "orders": ("id", "number", "po_number", "status", "client_id", "created_at"),
    "clients": ("id", "name", "nif", "contact_person"),
    "projects": ("id", "name", "status", "client_id", "created_at"),
    "products": ("id", "name", "category"),
}


async def ensure_search_indexes() -> None:
    """Ensure the indexes required by global search are present."""
    operations = []
    for collection_name, fields in SEARCH_INDEXES.items():
        collection = db[collection_name]
        for field in fields:
            operations.append(collection.create_index([(field, 1)], name=f"search_{collection_name}_{field}"))
    await asyncio.gather(*operations)
    logger.info("Global search indexes ready")
