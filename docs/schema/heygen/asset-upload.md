> ## Documentation Index
>
> Fetch the complete documentation index at: https://heygen-1fa696a7.mintlify.app/llms.txt
> Use this file to discover all available pages before exploring further.

# Upload Asset

> Uploads a file (image, video, audio, or PDF) and returns an asset_id for use in other endpoints. Max 32 MB. Supported types: png, jpeg, mp4, webm, mp3, wav, pdf.

## OpenAPI

```yaml /openapi/external-api.json post /v3/assets
openapi: 3.1.0
info:
  title: HeyGen External API
  version: 1.0.0
  description: >-
    HeyGen's external API for programmatic AI video creation. See
    https://docs.heygen.com for full documentation.
  contact:
    name: HeyGen Product Infra
    url: https://heygen.com
servers:
  - url: https://api.heygen.com
    description: Production
security:
  - ApiKeyAuth: []
  - BearerAuth: []
tags:
  - name: Video Agent
    description: Create videos from text prompts using AI
  - name: Videos
    description: Create, list, retrieve, and delete videos
  - name: Voices
    description: Text-to-speech and voice management
  - name: Video Translate
    description: Translate videos into other languages
  - name: User
    description: Account information and billing
  - name: Avatars
    description: List and manage avatars and looks
  - name: Assets
    description: Upload files for use in video creation
  - name: Webhooks
    description: Manage webhook endpoints and events
  - name: Lipsync
    description: Dub or replace audio on existing videos
paths:
  /v3/assets:
    post:
      tags:
        - Assets
      summary: Upload Asset
      description: >-
        Uploads a file (image, video, audio, or PDF) and returns an asset_id for
        use in other endpoints. Max 32 MB. Supported types: png, jpeg, mp4,
        webm, mp3, wav, pdf.
      operationId: uploadAsset
      requestBody:
        required: true
        content:
          multipart/form-data:
            schema:
              type: object
              properties:
                file:
                  type: string
                  format: binary
                  description: File to upload (image, video, audio, or PDF). Max 32 MB.
              required:
                - file
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: "#/components/schemas/UploadAssetV3Response"
        "400":
          description: Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: invalid_parameter
                  message: File is required. Upload a file using multipart/form-data.
                  param: file
                  doc_url: null
        "401":
          description: Authentication failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: authentication_failed
                  message: Invalid or expired API key. Verify your x-api-key header.
                  param: null
                  doc_url: null
        "429":
          description: Rate limit exceeded
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: rate_limit_exceeded
                  message: >-
                    Too many requests. Retry after the duration specified in the
                    Retry-After header.
                  param: null
                  doc_url: null
          headers:
            Retry-After:
              description: Seconds to wait before retrying
              schema:
                type: integer
      security:
        - ApiKeyAuth: []
        - BearerAuth: []
components:
  schemas:
    UploadAssetV3Response:
      description: Response from uploading an asset via POST /v3/assets.
      properties:
        asset_id:
          description: >-
            Unique asset identifier for use in other endpoints like POST
            /v3/video-agents
          title: Asset Id
          type: string
        url:
          description: Public URL of the uploaded asset
          title: Url
          type: string
        mime_type:
          description: Detected MIME type of the file
          title: Mime Type
          type: string
        size_bytes:
          description: File size in bytes
          title: Size Bytes
          type: integer
      required:
        - asset_id
        - url
        - mime_type
        - size_bytes
      title: UploadAssetV3Response
      type: object
    StandardAPIError:
      type: object
      properties:
        code:
          type: string
          description: Machine-readable error code
          example: invalid_parameter
        message:
          type: string
          description: Human-readable error message
          example: Video not found
        param:
          type:
            - string
            - "null"
          description: Which request field caused the error
        doc_url:
          type:
            - string
            - "null"
          description: Link to error documentation
      required:
        - code
        - message
  securitySchemes:
    ApiKeyAuth:
      type: apiKey
      in: header
      name: x-api-key
      description: HeyGen API key. Obtain from your HeyGen dashboard.
    BearerAuth:
      type: http
      scheme: bearer
      description: OAuth2 bearer token.
```
