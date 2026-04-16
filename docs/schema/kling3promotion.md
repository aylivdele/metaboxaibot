# Kling Video

> Transfer movements from a reference video to any character image. Cost-effective mode for motion transfer, perfect for portraits and simple animations.

## Overview

- **Endpoint**: `https://fal.run/fal-ai/kling-video/v3/pro/motion-control`
- **Model ID**: `fal-ai/kling-video/v3/pro/motion-control`
- **Category**: video-to-video
- **Kind**: inference
  **Tags**: stylized, transform, editing

## Pricing

- **Price**: $0.168 per seconds

For more details, see [fal.ai pricing](https://fal.ai/pricing).

## API Information

This model can be used via our HTTP API or more conveniently via our client libraries.
See the input and output schema below, as well as the usage examples.

### Input Schema

The API accepts the following input parameters:

- **`prompt`** (`string`, _optional_)
  - Examples: "A man dancing"

- **`image_url`** (`string`, _required_):
  Reference image URL. The characters, backgrounds, and other elements in the generated video are based on this reference image. Characters should have clear body proportions, avoid occlusion, and occupy more than 5% of the image area.
  - Examples: "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png"

- **`video_url`** (`string`, _required_):
  Reference video URL. The character actions in the generated video will be consistent with this reference video. Should contain a realistic style character with entire body or upper body visible, including head, without obstruction. Duration limit depends on character_orientation: 10s max for 'image', 30s max for 'video'.
  - Examples: "https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4"

- **`keep_original_sound`** (`boolean`, _optional_):
  Whether to keep the original sound from the reference video. Default value: `true`
  - Default: `true`

- **`character_orientation`** (`CharacterOrientationEnum`, _required_):
  Controls whether the output character's orientation matches the reference image or video. 'video': orientation matches reference video - better for complex motions (max 30s). 'image': orientation matches reference image - better for following camera movements (max 10s).
  - Options: `"image"`, `"video"`
  - Examples: "image"

- **`elements`** (`list<KlingV3ImageElementInput>`, _optional_):
  Optional element for facial consistency binding. Upload a facial element to enhance identity preservation in the generated video. Only 1 element is supported. Reference in prompt as @Element1. Element binding is only supported when character_orientation is 'video'.
  - Array of KlingV3ImageElementInput
  - Examples: null

**Required Parameters Example**:

```json
{
  "image_url": "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png",
  "video_url": "https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4",
  "character_orientation": "image"
}
```

**Full Example**:

```json
{
  "prompt": "A man dancing",
  "image_url": "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png",
  "video_url": "https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4",
  "keep_original_sound": true,
  "character_orientation": "image",
  "elements": null
}
```

### Output Schema

The API returns the following output format:

- **`video`** (`File`, _required_):
  The generated video
  - Examples: {"url":"https://v3b.fal.media/files/b/0a90ffb9/CnmmxIvK05VAq4gG8WiEQ_output.mp4"}

**Example Response**:

```json
{
  "video": {
    "url": "https://v3b.fal.media/files/b/0a90ffb9/CnmmxIvK05VAq4gG8WiEQ_output.mp4"
  }
}
```

## Usage Examples

### cURL

```bash
curl --request POST \
  --url https://fal.run/fal-ai/kling-video/v3/pro/motion-control \
  --header "Authorization: Key $FAL_KEY" \
  --header "Content-Type: application/json" \
  --data '{
     "image_url": "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png",
     "video_url": "https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4",
     "character_orientation": "image"
   }'
```

### Python

Ensure you have the Python client installed:

```bash
pip install fal-client
```

Then use the API client to make requests:

```python
import fal_client

def on_queue_update(update):
    if isinstance(update, fal_client.InProgress):
        for log in update.logs:
           print(log["message"])

result = fal_client.subscribe(
    "fal-ai/kling-video/v3/pro/motion-control",
    arguments={
        "image_url": "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png",
        "video_url": "https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4",
        "character_orientation": "image"
    },
    with_logs=True,
    on_queue_update=on_queue_update,
)
print(result)
```

### JavaScript

Ensure you have the JavaScript client installed:

```bash
npm install --save @fal-ai/client
```

Then use the API client to make requests:

```javascript
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/kling-video/v3/pro/motion-control", {
  input: {
    image_url: "https://v3b.fal.media/files/b/0a90ffa7/TNErq9yD7ZxGRATjfAqnh_EIgJSN67.png",
    video_url:
      "https://v3b.fal.media/files/b/0a90ff92/hklvF__w53diz6Rve7f5__JuDW2xl0mr6sJ_Kjz3Vxe_vidoeook%20(1)_1.mp4",
    character_orientation: "image",
  },
  logs: true,
  onQueueUpdate: (update) => {
    if (update.status === "IN_PROGRESS") {
      update.logs.map((log) => log.message).forEach(console.log);
    }
  },
});
console.log(result.data);
console.log(result.requestId);
```

## Additional Resources

### Documentation

- [Model Playground](https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control)
- [API Documentation](https://fal.ai/models/fal-ai/kling-video/v3/pro/motion-control/api)
- [OpenAPI Schema](https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/v3/pro/motion-control)

### fal.ai Platform

- [Platform Documentation](https://docs.fal.ai)
- [Python Client](https://docs.fal.ai/clients/python)
- [JavaScript Client](https://docs.fal.ai/clients/javascript)
