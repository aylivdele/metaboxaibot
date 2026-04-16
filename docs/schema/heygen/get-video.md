> ## Documentation Index
>
> Fetch the complete documentation index at: https://heygen-1fa696a7.mintlify.app/llms.txt
> Use this file to discover all available pages before exploring further.

# Get Video

> Returns details for a video including status, video_url, thumbnail_url, duration, and failure info if applicable.

## OpenAPI

```yaml /openapi/external-api.json get /v3/videos/{video_id}
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
  /v3/videos/{video_id}:
    get:
      tags:
        - Videos
      summary: Get Video
      description: >-
        Returns details for a video including status, video_url, thumbnail_url,
        duration, and failure info if applicable.
      operationId: getVideoV3
      parameters:
        - name: video_id
          in: path
          required: true
          schema:
            type: string
          description: Unique video identifier
      responses:
        "200":
          description: Successful response
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: "#/components/schemas/VideoDetail"
        "400":
          description: Invalid request parameters
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
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
        "404":
          description: Resource not found
          content:
            application/json:
              schema:
                type: object
                properties:
                  error:
                    $ref: "#/components/schemas/StandardAPIError"
              example:
                error:
                  code: not_found
                  message: Video not found.
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
    VideoDetail:
      description: |-
        Video resource returned by list and detail endpoints.

        If ``output_language`` is present the video is a translated video;
        otherwise it is a generated video.
      properties:
        id:
          description: Unique video identifier
          examples:
            - v_abc123def456
          title: Id
          type: string
        title:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Video title
          examples:
            - My Generated Video
          title: Title
        status:
          $ref: "#/components/schemas/VideoStatus"
          description: Current video status
          examples:
            - completed
        created_at:
          anyOf:
            - type: integer
            - type: "null"
          default: null
          description: Unix timestamp of creation
          examples:
            - 1711929600
          title: Created At
        completed_at:
          anyOf:
            - type: integer
            - type: "null"
          default: null
          description: Unix timestamp when video generation finished
          examples:
            - 1711930200
          title: Completed At
        video_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Presigned URL to download the video file
          examples:
            - https://files.heygen.ai/video/abc123.mp4
          title: Video Url
        thumbnail_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: URL to video thumbnail image
          examples:
            - https://files.heygen.ai/thumb/abc123.jpg
          title: Thumbnail Url
        gif_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: URL to animated GIF preview
          examples:
            - https://files.heygen.ai/gif/abc123.gif
          title: Gif Url
        captioned_video_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Presigned URL to download the video file with captions burned in
          examples:
            - https://files.heygen.ai/video/abc123_captioned.mp4
          title: Captioned Video Url
        subtitle_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Presigned URL to download the SRT subtitle file
          examples:
            - https://files.heygen.ai/srt/abc123.srt
          title: Subtitle Url
        duration:
          anyOf:
            - type: number
            - type: "null"
          default: null
          description: Video duration in seconds
          examples:
            - 30.5
          title: Duration
        folder_id:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: ID of containing folder
          examples:
            - folder_abc123
          title: Folder Id
        output_language:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: BCP-47 output language code. Present only for translated videos.
          examples:
            - en-US
          title: Output Language
        failure_code:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: Machine-readable failure reason. Only present when status is failed.
          examples:
            - rendering_failed
          title: Failure Code
        failure_message:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: >-
            Human-readable failure description. Only present when status is
            failed.
          examples:
            - Avatar rendering timed out
          title: Failure Message
        video_page_url:
          anyOf:
            - type: string
            - type: "null"
          default: null
          description: URL to the video page in the HeyGen app
          examples:
            - https://app.heygen.com/video/abc123
          title: Video Page Url
      required:
        - id
        - status
      title: VideoDetail
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
    VideoStatus:
      enum:
        - pending
        - processing
        - completed
        - failed
      title: VideoStatus
      type: string
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
