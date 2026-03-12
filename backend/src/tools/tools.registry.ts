/**
 * 工具注册表：汇总所有 Tool 定义，供 ChatOpenAI.bindTools() 使用
 * 后续扩展 agent 或其他工具时在此追加即可
 */

import { getToolDefinition as getTableSchemaToolDef } from './generate-table-schema.tool';
import { getToolDefinition as getRowDataToolDef } from './generate-row-data.tool';

export const TOOL_NAMES = {
  GENERATE_TABLE_SCHEMA: 'generate_table_schema',
  GENERATE_ROW_DATA: 'generate_row_data',
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

/** 供 model.bindTools(tools) 使用的工具定义数组（OpenAI function 格式） */
export function getAllToolDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }> {
  return [getTableSchemaToolDef(), getRowDataToolDef()];
}
