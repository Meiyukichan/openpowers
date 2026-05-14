# Swagger 2.0 API 规范模板
#
# 填写下方的占位符。不相关的部分可删除。
# 详细规范参见：https://swagger.io/specification/v2/

swagger: "2.0"

info:
  title: "[产品名称] API"
  version: "1.0.0"
  description: |
    [简要描述此 API 提供的能力。]

host: "api.example.com"
basePath: "/v1"
schemes:
  - https

# 全局内容类型
consumes:
  - application/json
produces:
  - application/json

# --- 标签（用于端点分组）---
tags:
  - name: Health
    description: "服务健康检查。"
  # - name: Users
  #   description: "用户管理。"

# --- 安全定义 ---
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
  #     read: "读权限"
  #     write: "写权限"

# 全局生效时取消注释：
# security:
#   - BearerAuth: []

# --- 可复用参数 ---
parameters:
  Page:
    name: page
    in: query
    type: integer
    required: false
    default: 1
    description: "页码（从 1 开始）。"
  PageSize:
    name: page_size
    in: query
    type: integer
    required: false
    default: 20
    description: "每页数量。"

# --- 通用响应 ---
responses:
  Unauthorized:
    description: "需要认证。"
    schema:
      $ref: "#/definitions/ErrorResponse"
  Forbidden:
    description: "权限不足。"
    schema:
      $ref: "#/definitions/ErrorResponse"
  NotFound:
    description: "资源未找到。"
    schema:
      $ref: "#/definitions/ErrorResponse"
  InternalError:
    description: "服务器错误。"
    schema:
      $ref: "#/definitions/ErrorResponse"

# --- 数据模型 ---
definitions:

  ErrorResponse:
    type: object
    properties:
      code:
        type: integer
        description: "业务状态码。200 表示成功。"
      message:
        type: string
        description: "人类可读的结果描述。"
      data:
        type: object
        description: "成功时的响应数据，错误时为 null。"

  Pagination:
    type: object
    properties:
      total:
        type: integer
        description: "总记录数。"
      page:
        type: integer
      page_size:
        type: integer

  # === 领域模型 ===
  # User:
  #   type: object
  #   required:
  #     - name
  #     - email
  #   properties:
  #     id:
  #       type: string
  #       format: uuid
  #       description: "唯一标识符。"
  #     name:
  #       type: string
  #       description: "显示名称。"
  #     email:
  #       type: string
  #       format: email
  #     status:
  #       type: string
  #       enum:
  #         - active
  #         - inactive
  #       description: "账号状态。"
  #     created_at:
  #       type: string
  #       format: date-time
  #     updated_at:
  #       type: string
  #       format: date-time

# --- API 端点 ---
paths:

  # ====== 健康检查 ======
  /health:
    get:
      tags:
        - Health
      summary: "健康检查"
      description: "返回服务健康状态，无需认证。"
      produces:
        - application/json
      responses:
        200:
          description: "服务正常。"
          schema:
            type: object
            properties:
              status:
                type: string
                example: "ok"

  # ====== 示例 CRUD：/users ======
  # /users:
  #   get:
  #     tags:
  #       - Users
  #     summary: "获取用户列表"
  #     description: "返回分页用户列表。"
  #     parameters:
  #       - $ref: "#/parameters/Page"
  #       - $ref: "#/parameters/PageSize"
  #     responses:
  #       200:
  #         description: "分页用户列表。"
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
  #     summary: "创建用户"
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
  #         description: "用户创建成功。"
  #         schema:
  #           $ref: "#/definitions/User"
  #       400:
  #         description: "无效输入。"
  #         schema:
  #           $ref: "#/definitions/ErrorResponse"
  #       401:
  #         $ref: "#/responses/Unauthorized"
  #
  # /users/{id}:
  #   get:
  #     tags:
  #       - Users
  #     summary: "根据 ID 获取用户"
  #     parameters:
  #       - name: id
  #         in: path
  #         type: string
  #         format: uuid
  #         required: true
  #         description: "用户 ID。"
  #     responses:
  #       200:
  #         description: "用户已找到。"
  #         schema:
  #           $ref: "#/definitions/User"
  #       404:
  #         $ref: "#/responses/NotFound"
  #
  #   put:
  #     tags:
  #       - Users
  #     summary: "更新用户"
  #     parameters:
  #       - name: id
  #         in: path
  #         type: string
  #         format: uuid
  #         required: true
  #         description: "用户 ID。"
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
  #         description: "用户更新成功。"
  #         schema:
  #           $ref: "#/definitions/User"
  #       404:
  #         $ref: "#/responses/NotFound"
  #
  #   delete:
  #     tags:
  #       - Users
  #     summary: "删除用户"
  #     parameters:
  #       - name: id
  #         in: path
  #         type: string
  #         format: uuid
  #         required: true
  #         description: "用户 ID。"
  #     responses:
  #       204:
  #         description: "用户已删除，无返回内容。"
  #       404:
  #         $ref: "#/responses/NotFound"
