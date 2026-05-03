> ## Documentation Index
>
> Fetch the complete documentation index at: https://docs.cartesia.ai/llms.txt
> Use this file to discover all available pages before exploring further.

# List Voices

## OpenAPI

```yaml /latest.yml GET /voices
openapi: 3.0.1
info:
  title: Cartesia API
  version: 0.0.1
servers:
  - url: https://api.cartesia.ai
    description: Production
security: []
paths:
  /voices:
    get:
      tags:
        - Voices
      summary: List Voices
      operationId: voices_list
      parameters:
        - $ref: "#/components/parameters/CartesiaVersionHeader"
        - name: limit
          in: query
          description: The number of Voices to return per page, ranging between 1 and 100.
          required: false
          schema:
            type: integer
            nullable: true
        - name: starting_after
          in: query
          description: >-
            A cursor to use in pagination. `starting_after` is a Voice ID that
            defines your

            place in the list. For example, if you make a /voices request and
            receive 100

            objects, ending with `voice_abc123`, your subsequent call can
            include

            `starting_after=voice_abc123` to fetch the next page of the list.
          required: false
          schema:
            type: string
            nullable: true
        - name: ending_before
          in: query
          description: >-
            A cursor to use in pagination. `ending_before` is a Voice ID that
            defines your

            place in the list. For example, if you make a /voices request and
            receive 100

            objects, starting with `voice_abc123`, your subsequent call can
            include

            `ending_before=voice_abc123` to fetch the previous page of the list.
          required: false
          schema:
            type: string
            nullable: true
        - name: q
          in: query
          description: Query string to search for voices by name, description, or Voice ID.
          required: false
          schema:
            type: string
            nullable: true
        - name: is_owner
          in: query
          description: Whether to only return voices owned your organization.
          required: false
          schema:
            type: boolean
            nullable: true
        - name: gender
          in: query
          description: The gender presentation of the voices to return.
          required: false
          schema:
            $ref: "#/components/schemas/GenderPresentation"
            nullable: true
        - name: language
          in: query
          description: >-
            Filter voices by a language or language-locale pair such as `en` or
            `en_GB`. A language-locale pair returns accents for that specific
            locale; a language alone returns all accents for that language. Both
            `-` and `_` separators are accepted.
          required: false
          schema:
            type: string
            nullable: true
        - name: expand[]
          in: query
          description: Additional fields to include in the response.
          required: false
          schema:
            type: array
            items:
              $ref: "#/components/schemas/VoiceExpandOptions"
            nullable: true
      responses:
        "200":
          description: ""
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/GetVoicesResponse"
      security:
        - APIKeyAuth: []
components:
  parameters:
    CartesiaVersionHeader:
      name: Cartesia-Version
      in: header
      description: API version header.
      required: true
      schema:
        type: string
        format: date
        example: "2026-03-01"
        enum:
          - "2024-06-10"
          - "2024-11-13"
          - "2025-04-16"
          - "2026-03-01"
  schemas:
    GenderPresentation:
      title: GenderPresentation
      type: string
      enum:
        - masculine
        - feminine
        - gender_neutral
    VoiceExpandOptions:
      title: VoiceExpandOptions
      type: string
      enum:
        - preview_file_url
    GetVoicesResponse:
      title: GetVoicesResponse
      type: object
      properties:
        data:
          type: array
          items:
            $ref: "#/components/schemas/Voice"
          description: The paginated list of Voices.
        has_more:
          type: boolean
          description: >-
            Whether there are more Voices to fetch (using `starting_after=id`,
            where id is the ID of the last Voice in the current response).
        next_page:
          $ref: "#/components/schemas/VoiceId"
          nullable: true
          description: >-
            (Deprecated - use the id of the last Voice in the current response
            instead.) An ID that can be passed as `starting_after` to get the
            next page of Voices.
      required:
        - data
        - has_more
    Voice:
      title: Voice
      type: object
      properties:
        id:
          $ref: "#/components/schemas/VoiceId"
        is_owner:
          type: boolean
          description: Whether your organization owns the voice.
        is_public:
          type: boolean
          description: Whether the voice is publicly accessible.
        name:
          type: string
          description: The name of the voice.
        description:
          type: string
          description: The description of the voice.
        gender:
          $ref: "#/components/schemas/GenderPresentation"
          nullable: true
          description: The gender of the voice, if specified.
        created_at:
          type: string
          format: date-time
          description: The date and time the voice was created.
        preview_file_url:
          type: string
          nullable: true
          description: >-
            A URL to download a preview audio file for this voice. Useful to
            avoid consuming credits when looking for the right voice. The URL
            requires the same Authorization header. Voice previews may be
            changed, moved, or deleted so you should avoid storing the URL
            permanently. This property will be null if there's no preview
            available. Only included when `expand[]` includes
            `preview_file_url`.
        language:
          $ref: "#/components/schemas/SupportedLanguage"
      required:
        - id
        - is_owner
        - is_public
        - name
        - description
        - created_at
        - language
      example:
        id: <string>
        is_owner: true
        is_public: false
        name: <string>
        description: <string>
        language: en
        created_at: "2024-11-04T05:31:56Z"
    VoiceId:
      title: VoiceId
      type: string
      description: The ID of the voice.
    SupportedLanguage:
      title: SupportedLanguage
      type: string
      enum:
        - en
        - fr
        - de
        - es
        - pt
        - zh
        - ja
        - hi
        - it
        - ko
        - nl
        - pl
        - ru
        - sv
        - tr
        - tl
        - bg
        - ro
        - ar
        - cs
        - el
        - fi
        - hr
        - ms
        - sk
        - da
        - ta
        - uk
        - hu
        - "no"
        - vi
        - bn
        - th
        - he
        - ka
        - id
        - te
        - gu
        - kn
        - ml
        - mr
        - pa
      description: >-
        The language that the given voice should speak the transcript in. For
        valid options, see [Models](/build-with-cartesia/tts-models/latest).
  securitySchemes:
    APIKeyAuth:
      type: http
      scheme: bearer
      bearerFormat: API Key
      description: >-
        Cartesia API key (`sk_car_...`). Get one at
        [play.cartesia.ai/keys](https://play.cartesia.ai/keys).
```
