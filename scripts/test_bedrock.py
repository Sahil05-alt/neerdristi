import sys
import boto3

REGION = "ap-south-1"
CANDIDATES = ["amazon.nova-lite-v1:0", "apac.amazon.nova-lite-v1:0"]

path = sys.argv[1]
with open(path, "rb") as f:
    data = f.read()

if data[:4] == b"\x89PNG":
    fmt = "png"
elif data[:2] == b"\xff\xd8":
    fmt = "jpeg"
else:
    fmt = "webp"

client = boto3.client("bedrock-runtime", region_name=REGION)

for model_id in CANDIDATES:
    try:
        resp = client.converse(
            modelId=model_id,
            messages=[{
                "role": "user",
                "content": [
                    {"image": {"format": fmt, "source": {"bytes": data}}},
                    {"text": "Describe this image in one sentence. Is there standing water on the road?"},
                ],
            }],
        )
        print(f"WORKS with {model_id}")
        print(resp["output"]["message"]["content"][0]["text"])
        break
    except Exception as e:
        print(f"FAILED {model_id}: {e}")