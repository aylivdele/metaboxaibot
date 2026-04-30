# Get Veo3.1 Video Details

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths:
  /api/v1/veo/record-info:
    get:
      summary: Get Veo3.1 Video Details
      deprecated: false
      description: >

        ::: info[]
          This endpoint is the authoritative source of truth for querying the execution status
          and final results of all Veo 3.1 video tasks, including regular generation,
          video extension, 1080P upgrade, and 4K upgrade tasks.
        :::


        ## Supported Task Types


        This interface supports querying **all Veo 3.1 task types**, including:


        * **Regular Video Generation**  
          Text-to-video, image-to-video, reference/material-based generation
        * **Video Extension**  
          Tasks created via the Extend Veo 3.1 Video interface
        * **1080P Upgrade Tasks**  
          High-definition upgrade tasks created via Get 1080P Video
        * **4K Upgrade Tasks**  
          Ultra-high-definition upgrade tasks created via Get 4K Video

        ## Status Descriptions


        | successFlag | Description |

        |------------|-------------|

        | `0` | Generating — task is currently being processed |

        | `1` | Success — task completed successfully |

        | `2` | Failed — task failed before completion |

        | `3` | Generation Failed — task created successfully but upstream
        generation failed |


        ## Important Notes


        * Query task status using `taskId`

        * You may poll this endpoint periodically until the task completes

        * Callback mechanisms push completion events, but **this endpoint
        remains the final authority**

        * `fallbackFlag` is a **legacy field** and may appear only in older
        regular generation tasks


        ### Response Field Descriptions


        <ParamField path="fallbackFlag" type="boolean">

        Only exists in regular video generation tasks. Whether generated using
        fallback model. `true` means backup model was used, `false` means
        primary model was used. 4K video generation tasks do not include this
        field.

        </ParamField>


        <ParamField path="successFlag" type="integer">

        Task success status identifier:

        - `0`: Generating

        - `1`: Success

        - `2`: Failed

        - `3`: Generation Failed

        </ParamField>


        <ParamField path="response" type="object">

        Detailed result information after task completion. For regular video
        generation tasks, contains video URLs etc.; for 4K video generation
        tasks, contains 4K video URLs and related media information.

        </ParamField>


        ### Task Type Identification


        #### Regular Video Generation Tasks

        The `fallbackFlag` field can identify whether the task used a fallback
        model:

        - `true`: Generated using fallback model, video resolution is 720p

        - `false`: Generated using primary model, may support 1080P (16:9 aspect
        ratio)


        ::: note[]

        Videos generated using the fallback model cannot be upgraded to
        high-definition versions through the Get 1080P Video interface.

        :::


        #### 4K Video Generation Tasks

        - Dedicated tasks for generating 4K ultra-high-definition videos

        - Does not include `fallbackFlag` field

        - Generated videos are in 4K resolution

        - Response includes `mediaIds` and related media information
      operationId: get-veo3-1-video-details
      tags:
        - docs/en/Market/Veo3.1 API
      parameters:
        - name: taskId
          in: query
          description: Task ID
          required: true
          example: veo_task_abcdef123456
          schema:
            type: string
      responses:
        "200":
          description: Request successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    enum:
                      - 200
                      - 400
                      - 401
                      - 404
                      - 422
                      - 451
                      - 455
                      - 500
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **400**: Your prompt was flagged by Website as violating
                      content policies.

                      Only English prompts are supported at this time.

                      Failed to fetch the image. Kindly verify any access limits
                      set by you or your service provider.

                      public error unsafe image upload.

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **422**: Validation Error - The request parameters
                      failed validation checks.

                      record is null.

                      Temporarily supports records within 14 days.

                      record result data is blank.

                      record status is not success.

                      record result data not exist.

                      record result data is empty.

                      - **451**: Failed to fetch the image. Kindly verify any
                      access limits set by you or your service provider.

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request.

                      Timeout

                      Internal Error, Please try again later.
                  msg:
                    type: string
                    description: Error message when code != 200
                    examples:
                      - success
                  data:
                    type: object
                    properties:
                      taskId:
                        type: string
                        description: Unique identifier of the video generation task
                        examples:
                          - veo_task_abcdef123456
                      paramJson:
                        type: string
                        description: Request parameters in JSON format
                        examples:
                          - >-
                            {"prompt":"A futuristic city with flying cars at
                            sunset.","waterMark":"KieAI"}
                      completeTime:
                        type: number
                        description: Task completion time
                      response:
                        type: object
                        description: Final result
                        properties:
                          taskId:
                            type: string
                            description: Task ID
                            examples:
                              - veo_task_abcdef123456
                          resultUrls:
                            type: array
                            items:
                              type: string
                            description: Generated video URLs
                            examples:
                              - - http://example.com/video1.mp4
                            nullable: true
                          fullResultUrls:
                            type: array
                            items:
                              type: string
                            description: Full video URLs after extended
                          originUrls:
                            type: array
                            items:
                              type: string
                            description: "Original video URLs. "
                            examples:
                              - - http://example.com/original_video1.mp4
                            nullable: true
                          resolution:
                            type: string
                            description: Video resolution information
                            examples:
                              - 1080p
                        x-apidog-orders:
                          - taskId
                          - resultUrls
                          - fullResultUrls
                          - originUrls
                          - resolution
                        required:
                          - fullResultUrls
                        x-apidog-ignore-properties: []
                      successFlag:
                        type: integer
                        description: |-
                          Generation status flag

                          - **0**: Generating
                          - **1**: Success
                          - **2**: Failed
                          - **3**: Generation Failed
                        enum:
                          - 0
                          - 1
                          - 2
                        examples:
                          - 1
                      errorCode:
                        type: integer
                        description: >-
                          Error code when task fails


                          - **400**: Your prompt was flagged by Website as
                          violating content policies.

                          Only English prompts are supported at this time.

                          Failed to fetch the image. Kindly verify any access
                          limits set by you or your service provider.

                          public error unsafe image upload.

                          - **500**: Internal Error, Please try again later.

                          Internal Error - Timeout

                          - **501**: Failed - Video generation task failed
                        format: int32
                        enum:
                          - 400
                          - 500
                          - 501
                        nullable: true
                      errorMessage:
                        type: string
                        description: Error message when task fails
                        examples:
                          - null
                        nullable: true
                      createTime:
                        type: number
                        description: Task creation time
                      fallbackFlag:
                        type: boolean
                        description: >-
                          Whether generated using fallback model. True means
                          backup model was used, false means primary model was
                          used
                        deprecated: true
                        examples:
                          - false
                    x-apidog-orders:
                      - taskId
                      - paramJson
                      - completeTime
                      - response
                      - successFlag
                      - errorCode
                      - errorMessage
                      - createTime
                      - fallbackFlag
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 200
                msg: success
                data:
                  taskId: veo_task_abcdef123456
                  paramJson: >-
                    {"prompt":"A futuristic city with flying cars at
                    sunset.","waterMark":"KieAI"}
                  completeTime: "2025-06-06 10:30:00"
                  response:
                    taskId: veo_task_abcdef123456
                    resultUrls:
                      - http://example.com/video1.mp4
                    originUrls:
                      - http://example.com/original_video1.mp4
                    fullResultUrls:
                      - http://example.com/full_result.mp4
                    resolution: 1080p
                  successFlag: 1
                  errorCode: null
                  errorMessage: ""
                  createTime: "2025-06-06 10:25:00"
                  fallbackFlag: false
          headers: {}
          x-apidog-name: ""
        "500":
          description: request failed
          content:
            application/json:
              schema:
                type: object
                properties:
                  code:
                    type: integer
                    description: >-
                      Response status code


                      - **200**: Success - Request has been processed
                      successfully

                      - **401**: Unauthorized - Authentication credentials are
                      missing or invalid

                      - **402**: Insufficient Credits - Account does not have
                      enough credits to perform the operation

                      - **404**: Not Found - The requested resource or endpoint
                      does not exist

                      - **408**: Upstream is currently experiencing service
                      issues. No result has been returned for over 10 minutes.

                      - **422**: Validation Error - The request parameters
                      failed validation checks

                      - **429**: Rate Limited - Request limit has been exceeded
                      for this resource

                      - **455**: Service Unavailable - System is currently
                      undergoing maintenance

                      - **500**: Server Error - An unexpected error occurred
                      while processing the request

                      - **501**: Generation Failed - Content generation task
                      failed

                      - **505**: Feature Disabled - The requested feature is
                      currently disabled
                  msg:
                    type: string
                    description: Response message, error description when failed
                  data:
                    type: object
                    properties: {}
                    x-apidog-orders: []
                    x-apidog-ignore-properties: []
                x-apidog-orders:
                  - code
                  - msg
                  - data
                required:
                  - code
                  - msg
                  - data
                x-apidog-ignore-properties: []
              example:
                code: 500
                msg: >-
                  Server Error - An unexpected error occurred while processing
                  the request
                data: null
          headers: {}
          x-apidog-name: "Error "
      security:
        - BearerAuth: []
          x-apidog:
            schemeGroups:
              - id: kn8M4YUlc5i0A0179ezwx
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: kn8M4YUlc5i0A0179ezwx
            scopes:
              kn8M4YUlc5i0A0179ezwx:
                BearerAuth: []
      x-apidog-folder: docs/en/Market/Veo3.1 API
      x-apidog-status: released
      x-run-in-apidog: https://app.apidog.com/web/project/1184766/apis/api-28506312-run
components:
  schemas: {}
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      bearerFormat: API Key
      description: |-
        所有 API 都需要通过 Bearer Token 进行身份验证。

        获取 API Key：
        1. 访问 [API Key 管理页面](https://kie.ai/api-key) 获取您的 API Key

        使用方法：
        在请求头中添加：
        Authorization: Bearer YOUR_API_KEY

        注意事项：
        - 请妥善保管您的 API Key，切勿泄露给他人
        - 若怀疑 API Key 泄露，请立即在管理页面重置
servers:
  - url: https://api.kie.ai
    description: 正式环境
security:
  - BearerAuth: []
    x-apidog:
      schemeGroups:
        - id: kn8M4YUlc5i0A0179ezwx
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: kn8M4YUlc5i0A0179ezwx
      scopes:
        kn8M4YUlc5i0A0179ezwx:
          BearerAuth: []
```
