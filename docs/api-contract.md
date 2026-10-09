# API contract

Base URL: from `sam deploy` output (`ApiUrl`), e.g.
`https://abc123.execute-api.ap-south-1.amazonaws.com/dev`

## POST /frames/upload-url

Request:
```json
{ "street_id": "ghz-014", "lat": 28.6692, "lng": 77.4538, "source": "citizen" }
```

Response:
```json
{
  "upload_url": "https://neerdrishti-frames-xxxx.s3.amazonaws.com/",
  "fields": { "...": "presigned POST fields" },
  "frame_key": "frames/ghz-014/abc123.jpg"
}
```
Upload the actual photo as a multipart form POST to `upload_url`, including all `fields` plus the file under the `file` key.

## GET /streets

Response:
```json
{
  "count": 2,
  "streets": [
    { "street_id": "ghz-014", "lat": 28.6692, "lng": 77.4538, "state": "waterlogged", "confidence": 0.87, "updated_at": "2026-10-05T07:18:02Z" }
  ]
}
```

## GET /streets/{street_id}

Response: single street object, same shape as above. 404 if not found.

## POST /alerts/subscribe (not yet implemented)

Planned shape:
```json
{ "phone": "+91XXXXXXXXXX", "area": "ghaziabad" }
```

---
`state` is always one of: `clear`, `waterlogged`, `severe`.
