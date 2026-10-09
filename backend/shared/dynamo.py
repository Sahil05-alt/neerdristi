"""
Shared DynamoDB helpers for the streets table.
Table schema (single-table, PAY_PER_REQUEST):
  street_id   (S, partition key)
  lat         (N)
  lng         (N)
  state       (S)   -> "clear" | "waterlogged" | "severe"
  confidence  (N)
  updated_at  (S)   -> ISO8601 timestamp
"""

import os
import boto3
from decimal import Decimal
from datetime import datetime, timezone

TABLE_NAME = os.environ.get("TABLE_NAME", "neerdrishti-streets")
_dynamodb = boto3.resource("dynamodb")
_table = _dynamodb.Table(TABLE_NAME)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def put_street_state(street_id: str, lat: float, lng: float,
                      state: str, confidence: float) -> None:
    _table.put_item(Item={
        "street_id": street_id,
        "lat": Decimal(str(lat)),
        "lng": Decimal(str(lng)),
        "state": state,
        "confidence": Decimal(str(confidence)),
        "updated_at": now_iso(),
    })


def get_street(street_id: str) -> dict | None:
    resp = _table.get_item(Key={"street_id": street_id})
    return resp.get("Item")


def get_all_streets() -> list[dict]:
    resp = _table.scan()
    items = resp.get("Items", [])
    while "LastEvaluatedKey" in resp:
        resp = _table.scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        items.extend(resp.get("Items", []))
    return items


def to_jsonable(item: dict) -> dict:
    """Convert Decimal fields (DynamoDB) into plain floats for JSON responses."""
    out = {}
    for k, v in item.items():
        out[k] = float(v) if isinstance(v, Decimal) else v
    return out
