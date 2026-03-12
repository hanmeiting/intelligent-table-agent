# 智能建表 Agent API 文档

本模块提供了通过自然语言智能创建数据库表的功能。所有表采用固定的系统结构模板。

## 1. 生成表结构建议

根据用户的自然语言描述，通过大模型提取核心信息，并结合固定模板生成表结构建议。

**接口**: `POST /api/table/generate`

**请求体 (JSON)**:
```json
{
  "description": "创建一个员工表，用来记录员工的姓名和职位"
}
```

**响应成功 (JSON)**:
```json
{
  "success": true,
  "data": {
    "tableName": "employees",
    "displayName": "员工表",
    "description": "用来记录员工的姓名和职位",
    "fields": [
      { "name": "id", "type": "INT", "primaryKey": true, "autoIncrement": true, "comment": "主键ID" },
      { "name": "custom_data", "type": "JSON", "comment": "业务数据JSON" },
      ...
    ]
  }
}
```

## 2. 执行创建表

确认表结构无误后，向数据库实际发送创建表的 DDL 命令，并默认插入一条示例数据。

**接口**: `POST /api/table/create`

**请求体 (JSON)**:
```json
{
  "tableName": "employees",
  "displayName": "员工表",
  "description": "用来记录员工的姓名和职位",
  "insertSampleData": true, 
  "fields": [
    ... // generate 接口返回的 fields
  ]
}
```

**响应成功 (JSON)**:
```json
{
  "success": true,
  "data": {
    "tableName": "employees",
    "created": true,
    "createMessage": "表 employees 创建成功",
    "sampleDataInserted": true,
    "insertMessage": "成功插入1条示例数据"
  }
}
```

## 3. 预览表数据

**接口**: `GET /api/table/preview/:tableName`

**响应成功 (JSON)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "custom_data": "{\"name\":\"员工表\",\"description\":\"用来记录员工的姓名和职位\"}",
      "created_at": "2023-10-25T10:00:00Z"
    }
  ]
}
```

## 开发者说明

目前数据库表结构在 `TableGeneratorService` (文件 `backend/src/table/services/table-generator.service.ts`) 中通过 `fixedSchemaTemplate` 变量固化。如需修改底层默认创建的表结构字段，请修改此模板。业务字段统一存入 `custom_data` (JSON类型) 字段中以实现动态扩展。