"""
S3 trigger: classifies each uploaded frame with a Bedrock vision model
and writes the result to DynamoDB.

The model is set by the MODEL_ID environment variable, so switching from
Nova to Claude later is a one-line change in template.yaml.

Output state is one of: "clear", "waterlogged", "severe", "unknown".
"unknown" is used when the model reply can't be parsed, so we never
show a made-up result.
"""

import os
import re
import json
import urllib.parse
import boto3
from decimal import Decimal
from datetime import datetime, timezone

TABLE_NAME = os.environ["TABLE_NAME"]
MODEL_ID = os.environ.get("MODEL_ID", "amazon.nova-lite-v1:0")
REGION = os.environ.get("AWS_REGION", "ap-south-1")

s3 = boto3.client("s3")
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
table = boto3.resource("dynamodb").Table(TABLE_NAME)

PROMPT = """You are a flood-monitoring assistant for Indian city streets.
Look at this street image and decide the water condition of the ROAD.

Definitions:
- "clear": road surface is visible and not covered by standing water (wet roads and small puddles are still clear).
- "waterlogged": standing water covers a significant part of the road, but vehicles can still pass slowly.
- "severe": deep water; vehicles are partly submerged, or the road is impassable.

Reply with ONLY a JSON object, no other text:
{"state": "clear" | "waterlogged" | "severe", "confidence": <number 0 to 1>, "reason": "<one short sentence>"}"""


def image_format(data: bytes) -> str:
    if data[:4] == b"\x89PNG":
        return "png"
    if data[:2] == b"\xff\xd8":
        return "jpeg"
    if data[:4] == b"RIFF":
        return "webp"
    return "jpeg"


def classify(image_bytes: bytes) -> tuple[str, float, str]:
    resp = bedrock.converse(
        modelId=MODEL_ID,
        messages=[{
            "role": "user",
            "content": [
                {"image": {"format": image_format(image_bytes), "source": {"bytes": image_bytes}}},
                {"text": PROMPT},
            ],
        }],
        inferenceConfig={"maxTokens": 200, "temperature": 0},
    )
    text = resp["output"]["message"]["content"][0]["text"]
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return "unknown", 0.0, "model reply could not be parsed"
    try:
        parsed = json.loads(match.group(0))
        state = str(parsed.get("state", "")).lower()
        if state not in ("clear", "waterlogged", "severe"):
            return "unknown", 0.0, "model returned an invalid state"
        confidence = float(parsed.get("confidence", 0.5))
        confidence = max(0.0, min(1.0, confidence))
        return state, confidence, str(parsed.get("reason", ""))[:200]
    except (ValueError, TypeError):
        return "unknown", 0.0, "model reply could not be parsed"


def lambda_handler(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key = urllib.parse.unquote_plus(record["s3"]["object"]["key"])

        obj = s3.get_object(Bucket=bucket, Key=key)
        image_bytes = obj["Body"].read()
        meta = obj.get("Metadata", {})

        street_id = meta.get("street_id", "unknown")
        lat = float(meta.get("lat", 0))
        lng = float(meta.get("lng", 0))

        try:
            state, confidence, reason = classify(image_bytes)
        except Exception as e:
            print(f"[inference] Bedrock error: {e}")
            state, confidence, reason = "unknown", 0.0, "classification failed"

        table.put_item(Item={
            "street_id": street_id,
            "lat": Decimal(str(lat)),
            "lng": Decimal(str(lng)),
            "state": state,
            "confidence": Decimal(str(round(confidence, 2))),
            "reason": reason,
            "model_id": MODEL_ID,
            "frame_key": key,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        print(f"[inference] {street_id} -> {state} ({confidence}) via {MODEL_ID}: {reason}")

    return {"statusCode": 200}