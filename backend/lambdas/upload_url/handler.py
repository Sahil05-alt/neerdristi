"""
POST /frames/upload-url

Request body (JSON):
  {
    "street_id": "ghz-014",     # optional - nearest known street/node id
    "lat": 28.6692,
    "lng": 77.4538,
    "source": "citizen"          # "citizen" | "camera"
  }

Response (JSON):
  {
    "upload_url": "...",
    "fields": {...},             # presigned POST fields, include in the form upload
    "frame_key": "frames/ghz-014/2026-10-05T07-18-00.jpg"
  }
"""

import os
import json
import uuid
import boto3

BUCKET_NAME = os.environ["BUCKET_NAME"]
s3 = boto3.client("s3")


def lambda_handler(event, context):
    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return _response(400, {"error": "invalid JSON body"})

    street_id = body.get("street_id", "unknown")
    lat = body.get("lat")
    lng = body.get("lng")
    source = body.get("source", "citizen")

    if lat is None or lng is None:
        return _response(400, {"error": "lat and lng are required"})

    frame_key = f"frames/{street_id}/{uuid.uuid4().hex}.jpg"

    presigned = s3.generate_presigned_post(
        Bucket=BUCKET_NAME,
        Key=frame_key,
        Fields={
            "x-amz-meta-street_id": street_id,
            "x-amz-meta-lat": str(lat),
            "x-amz-meta-lng": str(lng),
            "x-amz-meta-source": source,
        },
        Conditions=[
            {"x-amz-meta-street_id": street_id},
            {"x-amz-meta-lat": str(lat)},
            {"x-amz-meta-lng": str(lng)},
            {"x-amz-meta-source": source},
            ["content-length-range", 1, 10_000_000],  # max 10MB
        ],
        ExpiresIn=300,
    )

    return _response(200, {
        "upload_url": presigned["url"],
        "fields": presigned["fields"],
        "frame_key": frame_key,
    })


def _response(status: int, body: dict):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        "body": json.dumps(body),
    }
