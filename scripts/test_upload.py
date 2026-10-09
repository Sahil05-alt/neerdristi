"""
End-to-end pipeline test for Neerdrishti.

Usage:
    python test_upload.py /path/to/any/image.png
    python test_upload.py /path/to/image.png ghz-014 28.6692 77.4538

Does three things in one run (so the presigned URL never expires):
  1. POST /frames/upload-url   -> get presigned S3 POST
  2. Upload the image to S3    -> triggers the inference Lambda
  3. GET /streets              -> shows the state written to DynamoDB
"""

import sys
import time
import requests

API = "https://xk06lsyete.execute-api.ap-south-1.amazonaws.com/dev"

image_path = sys.argv[1]
street_id = sys.argv[2] if len(sys.argv) > 2 else "ghz-014"
lat = float(sys.argv[3]) if len(sys.argv) > 3 else 28.6692
lng = float(sys.argv[4]) if len(sys.argv) > 4 else 77.4538

# 1. presigned URL
r = requests.post(
    f"{API}/frames/upload-url",
    json={"street_id": street_id, "lat": lat, "lng": lng, "source": "citizen"},
)
r.raise_for_status()
data = r.json()
print("1. got upload URL, frame_key =", data["frame_key"])

# 2. upload the image
with open(image_path, "rb") as f:
    up = requests.post(data["upload_url"], data=data["fields"], files={"file": f})
print("2. upload status:", up.status_code, "(204 = success)")
if up.status_code != 204:
    print(up.text)
    sys.exit(1)

# 3. give the inference Lambda a few seconds, then read the result
print("3. waiting 8s for the inference Lambda...")
time.sleep(8)
res = requests.get(f"{API}/streets")
print(res.status_code)
print(res.json())
