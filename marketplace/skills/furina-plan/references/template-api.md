# Swagger 2.0 API Specification Template
#
# Fill in the placeholders below. Remove sections that don't apply.
# For details, see: https://swagger.io/specification/v2/

swagger: "2.0"

info:
  title: "[Product Name] API"
  version: "1.0.0"
  description: |
    [Brief description of what this API provides.]

host: "api.example.com"
basePath: "/v1"
schemes:
  - https

# Global content types
consumes:
  - application/json
produces:
  - application/json

# --- Tags (for endpoint grouping) ---
tags:
  - name: Health
    description: "Service health checks."
  # - name: Users
  #   description: "User management."

# --- Security Definitions ---
securityDefinitions:
  BearerAuth:
    type: apiKey
    name: Authorization
    in: header
    description: "Bearer <token>"

  # OAuth2:
  #   type: oauth2
  #   flow: password
  #   tokenUrl: "https://api.example.com/oauth/token"
  #   scopes:
  #     read: "Read access"
  #     write: "Write access"

# Uncomment to apply globally:
# security:
#   - BearerAuth: []

# --- Reusable Parameters ---
parameters:
  Page:
    name: page
    in: query
    type: integer
    required: false
    default: 1
    description: "Page number (1-based)."
  PageSize:
    name: page_size
    in: query
    type: integer
    required: false
    default: 20
    description: "Items per page."

# --- Common Responses ---
responses:
  Unauthorized:
    description: "Authentication required."
    schema:
      $ref: "#/definitions/ErrorResponse"
  Forbidden:
    description: "Insufficient permissions."
    schema:
      $ref: "#/definitions/ErrorResponse"
  NotFound:
    description: "Resource not found."
    schema:
      $ref: "#/definitions/ErrorResponse"
  InternalError:
    description: "Server error."
    schema:
      $ref: "#/definitions/ErrorResponse"

# --- Data Models ---
definitions:

  ErrorResponse:
    type: object
    properties:
      code:
        type: integer
        description: "Business status code. 200 = success."
      message:
        type: string
        description: "Human-readable description."
      data:
        type: object
        description: "Payload on success, null on error."

  Pagination:
    type: object
    properties:
      total:
        type: integer
        description: "Total record count."
      page:
        type: integer
      page_size:
        type: integer

  # === Domain Models ===
  # User:
  #   type: object
  #   required:
  #     - name
  #     - email
  #   properties:
  #     id:
  #       type: string
  #       format: uuid
  #       description: "Unique identifier."
  #     name:
  #       type: string
  #       description: "Display name."
  #     email:
  #       type: string
  #       format: email
  #     status:
  #       type: string
  #       enum:
  #         - active
  #         - inactive
  #       description: "Account status."
  #     created_at:
  #       type: string
  #       format: date-time
  #     updated_at:
  #       type: string
  #       format: date-time

# --- API Endpoints ---
paths:

  # ====== Health ======
  /health:
    get:
      tags:
        - Health
      summary: "Health check"
      description: "Returns service health status. No auth required."
      produces:
        - application/json
      responses:
        200:
          description: "Service is healthy."
          schema:
            type: object
            properties:
              status:
                type: string
                example: "ok"

  # ====== Example CRUD: /users ======
  # /users:
  #   get:
  #     tags:
  #       - Users
  #     summary: "List users"
  #     description: "Returns a paginated list of users."
  #     parameters:
  #       - $ref: "#/parameters/Page"
  #       - $ref: "#/parameters/PageSize"
  #     responses:
  #       200:
  #         description: "Paginated user list."
  #         schema:
  #           allOf:
  #             - $ref: "#/definitions/Pagination"
  #             - type: object
  #               properties:
  #                 data:
  #                   type: array
  #                   items:
  #                     $ref: "#/definitions/User"
  #       401:
  #         $ref: "#/responses/Unauthorized"
  #
  #   post:
  #     tags:
  #       - Users
  #     summary: "Create a user"
  #     parameters:
  #       - in: body
  #         name: body
  #         required: true
  #         schema:
  #           type: object
  #           required:
  #             - name
  #             - email
  #           properties:
  #             name:
  #               type: string
  #             email:
  #               type: string
  #               format: email
  #     responses:
  #       201:
  #         description: "User created."
  #         schema:
  #           $ref: "#/definitions/User"
  #       400:
  #         description: "Invalid input."
  #         schema:
  #           $ref: "#/definitions/ErrorResponse"
  #       401:
  #         $ref: "#/responses/Unauthorized"
  #
  # /users/{id}:
  #   get:
  #     tags:
  #       - Users
  #     summary: "Get user by ID"
  #     parameters:
  #       - name: id
  #         in: path
  #         type: string
  #         format: uuid
  #         required: true
  #         description: "User ID."
  #     responses:
  #       200:
  #         description: "User found."
  #         schema:
  #           $ref: "#/definitions/User"
  #       404:
  #         $ref: "#/responses/NotFound"
  #
  #   put:
  #     tags:
  #       - Users
  #     summary: "Update a user"
  #     parameters:
  #       - name: id
  #         in: path
  #         type: string
  #         format: uuid
  #         required: true
  #         description: "User ID."
  #       - in: body
  #         name: body
  #         required: true
  #         schema:
  #           type: object
  #           properties:
  #             name:
  #               type: string
  #             email:
  #               type: string
  #               format: email
  #     responses:
  #       200:
  #         description: "User updated."
  #         schema:
  #           $ref: "#/definitions/User"
  #       404:
  #         $ref: "#/responses/NotFound"
  #
  #   delete:
  #     tags:
  #       - Users
  #     summary: "Delete a user"
  #     parameters:
  #       - name: id
  #         in: path
  #         type: string
  #         format: uuid
  #         required: true
  #         description: "User ID."
  #     responses:
  #       204:
  #         description: "User deleted. No content."
  #       404:
  #         $ref: "#/responses/NotFound"
