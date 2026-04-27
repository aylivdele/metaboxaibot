> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.evolink.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# Error Codes Reference

> Complete list of task error codes and troubleshooting guide

## Error Response Format

When a task fails (`status: "failed"`), the response includes an `error` object:

```json theme={null}
{
  "id": "task-unified-1772618027-cmeisy8h",
  "object": "image.generation.task",
  "status": "failed",
  "model": "gemini-3.1-flash-image-preview",
  "progress": 0,
  "error": {
    "code": "content_policy_violation",
    "message": "Content policy violation.\nYour request was blocked by safety filters..."
  }
}
```

| Field           | Type     | Description                                               |
| --------------- | -------- | --------------------------------------------------------- |
| `error.code`    | `string` | Error code identifier. See the full list below            |
| `error.message` | `string` | User-friendly error description with troubleshooting tips |

---

## Error Codes Overview

<AccordionGroup>
  <Accordion title="Client Errors (Fixable by User)" icon="user" defaultOpen>
    | Error Code                 | Description                          | Retryable                |
    | -------------------------- | ------------------------------------ | ------------------------ |
    | `content_policy_violation` | Content violates safety policies     | Fix content, then retry  |
    | `invalid_parameters`       | Invalid request parameters           | Fix params, then retry   |
    | `image_processing_error`   | Image processing failed              | Use different image      |
    | `image_dimension_mismatch` | Image dimensions don't match request | Resize image, then retry |
    | `request_cancelled`        | Request was cancelled                | Resubmit                 |
  </Accordion>

  <Accordion title="Server Errors (Retry Later)" icon="server">
    | Error Code                     | Description                             | Retryable                     |
    | ------------------------------ | --------------------------------------- | ----------------------------- |
    | `generation_failed_no_content` | Model failed to generate output         | Try different prompt          |
    | `service_error`                | Internal service error                  | Auto-recovers, retry later    |
    | `generation_timeout`           | Task processing timed out               | Retry later                   |
    | `resource_exhausted`           | Upstream resources temporarily depleted | Auto-recovers, retry later    |
    | `quota_exceeded`               | Rate limit or quota exceeded            | Reduce frequency, retry later |
    | `service_unavailable`          | Service temporarily unavailable         | Auto-recovers, retry later    |
    | `resource_not_found`           | Task ID invalid or expired              | Check task ID                 |
    | `unknown_error`                | Unclassified error                      | Contact support               |
  </Accordion>
</AccordionGroup>

---

## Error Code Details

### content_policy_violation

<Card title="Content Policy Violation" icon="shield-halved" color="#e74c3c">
  Your request was blocked by safety filters. This is the **most common error type**, covering the following scenarios:
</Card>

**Common Triggers:**

| Sub-type              | Description                                         | Example Message                  |
| --------------------- | --------------------------------------------------- | -------------------------------- |
| Photorealistic people | Uploaded image contains real human faces            | `photorealistic people detected` |
| Celebrity likeness    | Involves celebrities or public figures              | `celebrity detected in image`    |
| Copyright/Trademark   | Involves brand logos, trademarks, or copyrighted IP | `third-party content violation`  |
| Adult/NSFW            | Contains nudity or sexually suggestive content      | `nudity detected`                |
| Violence/Self-harm    | Contains violent, graphic, or self-harm content     | `violence content blocked`       |
| Minor protection      | Involves sensitive content related to minors        | `minor content not allowed`      |
| General policy        | Other content policy violations                     | `content policy violation`       |

<Tip>
  **How to avoid:**

- Avoid uploading real photos of people — use illustration or cartoon styles instead
- Remove brand logos, trademarks, and copyrighted IP characters
- Avoid adult, violent, or self-harm themes
- Use generic character descriptions (e.g., "a person") instead of referencing specific celebrities
  </Tip>

---

### generation_failed_no_content

<Card title="Generation Failed" icon="image-slash" color="#e67e22">
  The model was unable to produce output for your request. While the request format was valid, the model could not generate a result during processing.
</Card>

**Common Causes:**

- **Poor prompt quality**: Description is too vague or contradictory for the model to understand
- **Model capability limits**: The prompt exceeds the model's generation capabilities
- **Upstream service issues**: The underlying model service returned an empty result
- **Protected content detection**: The prompt or reference image may involve watermark removal or protected content (logos, trademarks, etc.)

<Tip>
  **How to fix:**

- Adjust your prompt to be more clear and specific
- Use different reference images — avoid images with watermarks or logos
- Simplify the request (lower resolution or complexity)
- Simply retry — some cases succeed on retry
  </Tip>

---

### invalid_parameters

<Card title="Invalid Parameters" icon="sliders" color="#f39c12">
  Request parameters do not meet model requirements.
</Card>

**Common Sub-types:**

| Sub-type           | Description                                     | Example                                         |
| ------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Prompt too long    | Prompt exceeds model's maximum length           | `Prompt is too long`                            |
| Image dimension    | Image width/height or aspect ratio out of range | `image dimensions must be between 240 and 7680` |
| File too large     | Uploaded file exceeds size limit                | `file size exceeds 10MB`                        |
| Unsupported format | Uploaded file format is not supported           | `unsupported file type`                         |
| Video duration     | Video duration outside model's supported range  | `Video duration must be between 1-30 seconds`   |

<Tip>
  **How to fix:**

- Check the model-specific API documentation for parameter requirements
- Supported image formats: JPG, PNG, WebP, GIF (HEIC, AVIF, TIFF are **not** supported)
- Image size limits: typically \< 10MB, some models \< 30MB
- Shorten your prompt or split long prompts into core descriptions
  </Tip>

---

### image_processing_error

<Card title="Image Processing Failed" icon="file-image" color="#9b59b6">
  The system could not process the input image.
</Card>

**Common Causes:**

- Image URL is inaccessible (authentication required, CDN restrictions, expired link)
- Image format is not supported (e.g., HEIC, AVIF)
- Image file is corrupted
- Network issues prevented image download

<Tip>
  **How to fix:**

- Ensure the image URL is publicly accessible with no authentication or region restrictions
- Use standard formats: JPG, PNG, WebP
- Try using the [File Upload API](/en/api-manual/file-series/upload-base64) instead of URLs
- Verify the image opens correctly in a browser
  </Tip>

---

### image_dimension_mismatch

<Card title="Image Dimension Mismatch" icon="ruler-combined" color="#e74c3c">
  The input image dimensions do not match the dimensions specified in the request. Common in image-to-video scenarios.
</Card>

**Example:**

- `aspect_ratio=1280x720` (16:9) requires a 1280x720 landscape image
- `aspect_ratio=720x1280` (9:16) requires a 720x1280 portrait image

<Tip>
  **How to fix:**
  Resize your image to match the requested `aspect_ratio` parameter, or change the `aspect_ratio` to match your image.
</Tip>

---

### service_error

<Card title="Service Error" icon="server" color="#34495e">
  An internal issue occurred in the upstream service. This is usually temporary — the system automatically switches to other available routes.
</Card>

**Common Causes:**

- Upstream model service temporarily unavailable
- Server overload / high traffic
- Maintenance in progress
- Network connection interrupted

<Tip>
  **How to fix:**

- Wait 30-60 seconds and retry — the system usually recovers automatically
- If persistent, contact technical support
- No need to modify your request — retry the same request
  </Tip>

---

### generation_timeout

<Card title="Generation Timeout" icon="clock" color="#e67e22">
  The task did not complete within the allowed time.
</Card>

**Common Causes:**

- High system load causing queue delays
- High task complexity (high resolution, long video, etc.)
- Slow upstream service response

<Tip>
  **How to fix:**

- Retry later, preferably during off-peak hours
- Reduce task complexity: lower resolution, shorter video duration
- Simplify prompt descriptions
  </Tip>

---

### quota_exceeded

<Card title="Quota / Rate Limit Exceeded" icon="gauge-high" color="#e74c3c">
  Request frequency or concurrency limits have been exceeded.
</Card>

**Common Causes:**

- Too many requests sent in a short period (rate limiting)
- Multiple tasks processing simultaneously (concurrency limit)
- Account quota depleted

<Tip>
  **How to fix:**

- Reduce request frequency — recommended 1-2 second interval between requests
- Wait for in-progress tasks to complete before submitting new ones
- If quota is depleted, visit the [billing page](https://evolink.ai/dashboard/billing) to recharge
  </Tip>

---

### resource_exhausted

<Card title="Resource Exhausted" icon="battery-empty" color="#c0392b">
  Upstream service compute resources are temporarily depleted. Usually occurs during peak model usage periods.
</Card>

<Tip>
  **How to fix:**

- Wait 1-5 minutes for automatic recovery
- The system automatically switches between multiple routes — retrying later usually succeeds
  </Tip>

---

### resource_not_found

<Card title="Resource Not Found" icon="magnifying-glass" color="#7f8c8d">
  The requested task ID does not exist or has expired.
</Card>

<Tip>
  **How to fix:**

- Verify the task ID is correctly spelled
- Task results have an expiration period — expired tasks cannot be queried
- If the ID is correct, retry after a short wait
  </Tip>

---

### request_cancelled

<Card title="Request Cancelled" icon="ban" color="#95a5a6">
  The task was cancelled or interrupted during processing.
</Card>

<Tip>
  If you did not intentionally cancel, simply resubmit the same request.
</Tip>

---

### service_unavailable

<Card title="Service Unavailable" icon="plug-circle-xmark" color="#e74c3c">
  An internal authentication or connection issue occurred. This error has been automatically logged and will typically be resolved quickly.
</Card>

<Tip>
  **How to fix:**

- Wait a few minutes and retry
- If persistent, contact technical support with your task ID
  </Tip>

---

### unknown_error

<Card title="Unknown Error" icon="question" color="#7f8c8d">
  An unclassified error. The system could not identify the specific error type.
</Card>

<Tip>
  **How to fix:**

- Retry after a short wait
- If the issue persists, contact technical support with the full task ID
  </Tip>

---

## Best Practices

### Error Handling Example

```python theme={null}
import requests
import time

def poll_task_with_retry(task_id, api_key, max_retries=3):
    """Poll task status with automatic retry for server errors"""
    headers = {"Authorization": f"Bearer {api_key}"}

    for attempt in range(max_retries):
        resp = requests.get(
            f"https://api.evolink.ai/v1/tasks/{task_id}",
            headers=headers
        )
        data = resp.json()

        if data["status"] == "completed":
            return data["results"]

        if data["status"] == "failed":
            error = data.get("error", {})
            code = error.get("code", "unknown_error")
            message = error.get("message", "")

            # Client errors — not retryable, fix the request
            if code in [
                "content_policy_violation",
                "invalid_parameters",
                "image_processing_error",
                "image_dimension_mismatch",
            ]:
                raise Exception(f"Client error [{code}]: {message}")

            # Server errors — retryable
            if code in [
                "generation_failed_no_content",
                "service_error",
                "generation_timeout",
                "resource_exhausted",
                "quota_exceeded",
            ]:
                if attempt < max_retries - 1:
                    wait = 2 ** attempt * 5  # 5s, 10s, 20s
                    time.sleep(wait)
                    continue
                raise Exception(f"Server error [{code}]: {message}")

            raise Exception(f"Error [{code}]: {message}")

        # Task still processing
        time.sleep(3)

    raise Exception("Max polling attempts exceeded")
```

### Retryable vs Non-Retryable

<CardGroup cols={2}>
  <Card title="Fix Request Before Retry" icon="pen">
    * `content_policy_violation` — Modify content
    * `invalid_parameters` — Fix parameters
    * `image_processing_error` — Use different image
    * `image_dimension_mismatch` — Resize image
  </Card>

  <Card title="Safe to Retry Directly" icon="rotate">
    * `generation_failed_no_content` — Try different prompt
    * `service_error` — Wait, then retry
    * `generation_timeout` — Wait, then retry
    * `resource_exhausted` — Auto-recovers
    * `quota_exceeded` — Reduce frequency, then retry
  </Card>
</CardGroup>
