/**
 * generate_table_schema 工具示例
 *
 * 结构说明：
 * 1. 提示词（PROMPT_TEMPLATE）—— 大模型生成表结构主要靠这段文案 + 用户描述
 * 2. 工具定义（getToolDefinition）—— 给 model.bindTools() 用，让模型决定何时调用、传什么参数
 * 3. 工具执行（executeGenerateTableSchema）—— 真正执行时：用提示词调大模型，解析 JSON，拼上系统字段
 */

import { ChatOpenAI } from '@langchain/openai';
import { PromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';

// ---------------------------------------------------------------------------
// 1. 提示词：表结构生成全靠这一段 + 用户描述
// ---------------------------------------------------------------------------
const CONTROLS = {
  'rx-input': '单行文本',
  'rx-radio': '单选框',
  'rx-textarea': '单行文本',
  'rx-checkbox-list': '复选框',
  'rx-form-select': '下拉框',
  'rx-date': '日期',
  'rx-time': '时间',
  'rx-number': '数字',
  'rx-switch': '开关',
};

// LangChain 中 {{ }} 表示字面量花括号，{userInput} {controls} 为变量
export const PROMPT_TEMPLATE = `
你是一个专业的数据库架构师。用户会用自然语言要求创建一张表。物理表结构是固定的，但你需要推断出用户想要的【具体业务字段】。
请严格返回JSON格式数据，不要使用Markdown代码块（如\`\`\`json），只输出原始JSON字符串。
返回的JSON必须包含以下结构：
{{
  "tableName": "英文表名（如：employee_leaves），请使用复数形式和小写加下划线命名法",
  "displayName": "中文表名（如：员工请假表）",
  "description": "表的作用描述",
  "businessFields": [
    {{
      "name": "字段编码(如：name)",
      "fieldName": "字段名称(如：F_name)",
      "comment": "多行文本(如：姓名)",
      "type": "数据库物理类型(如：VARCHAR/INT/DATETIME/TEXT)",
      "dataType": "前端字段类型(clob/varchar/number/date等)",
      "length": "字段长度(如：255，可为null)",
      "decimalLength": "小数位数(可为null)",
      "control": "控件类型,必须从{controls}中选择",
      "isSingle": 1,
      "publishStatus": "DEPLOYED",
      "extJson": ""
    }}
  ]
}}

用户描述：{userInput}
结果：`.trim();

// 预留的系统字段（与 TableGeneratorService 一致）
const FIXED_SCHEMA_TEMPLATE = [
  { name: 'id', fieldName: 'F_id', type: 'INT', dataType: 'number', primaryKey: true, autoIncrement: true, comment: '主键ID', isSystem: true, control: 'rx-input' },
  { name: 'created_at', fieldName: 'F_created_at', type: 'DATETIME', dataType: 'datetime', defaultValue: 'CURRENT_TIMESTAMP', comment: '创建时间', isSystem: true, control: 'rx-date' },
  { name: 'updated_at', fieldName: 'F_updated_at', type: 'DATETIME', dataType: 'datetime', defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', comment: '更新时间', isSystem: true, control: 'rx-date' },
  { name: 'is_deleted', fieldName: 'F_is_deleted', type: 'TINYINT', dataType: 'number', length: 1, defaultValue: '0', comment: '是否删除', isSystem: true, control: 'rx-input' },
];

// ---------------------------------------------------------------------------
// 2. 工具定义：给 ChatOpenAI.bindTools(tools) 用
// 模型根据 description 决定何时调用，根据 parameters 传 description
// ---------------------------------------------------------------------------
export function getToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: 'generate_table_schema',
      description: '根据用户的自然语言描述，设计一张数据库表结构（表名、中文名、说明、业务字段列表）。例如：用户说“我要创建员工表”“帮我生成一个员工请假单”时调用此工具。不直接建表，只返回结构。',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: '用户的原始描述，例如：我要创建员工表、帮我生成一个员工请假单',
          },
        },
        required: ['description'],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 3. 工具执行：当模型选择了 generate_table_schema 并传入 description 时调用
// 这里用上面的提示词调大模型，解析 JSON，再拼上系统字段
// ---------------------------------------------------------------------------
export interface GenerateTableSchemaArgs {
  description: string;
}

export async function executeGenerateTableSchema(
  args: GenerateTableSchemaArgs,
  options?: { openAIApiKey?: string; baseURL?: string; modelName?: string },
): Promise<{
  tableName: string;
  displayName: string;
  description: string;
  businessFields: any[];
  fields: any[];
}> {
  const apiKey = options?.openAIApiKey ?? process.env.OPENAI_API_KEY ?? 'sk-placeholder';
  const baseUrl = options?.baseURL ?? process.env.OPENAI_BASE_URL;
  const modelName = options?.modelName ?? process.env.MODEL_NAME ?? 'gpt-3.5-turbo';

  const model = new ChatOpenAI({
    openAIApiKey: apiKey,
    configuration: baseUrl ? { baseURL: baseUrl } : undefined,
    modelName,
  });

  const prompt = PromptTemplate.fromTemplate(PROMPT_TEMPLATE);
  const chain = prompt.pipe(model).pipe(new StringOutputParser());

  const result = await chain.invoke({
    userInput: args.description,
    controls: JSON.stringify(CONTROLS),
  });

  const raw = result.trim();
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`generate_table_schema: LLM 返回不是合法 JSON: ${raw.slice(0, 200)}`);
  }

  const businessFields = (parsed.businessFields ?? []).map((f: any) => ({
    ...f,
    isSystem: false,
    type: f.type ?? 'VARCHAR',
  }));

  const fields = [...FIXED_SCHEMA_TEMPLATE, ...businessFields];

  return {
    tableName: parsed.tableName ?? `dynamic_table_${Date.now()}`,
    displayName: parsed.displayName ?? '自定义表',
    description: parsed.description ?? '',
    businessFields,
    fields,
  };
}
