/**
 * generate_row_data 工具
 *
 * 1. 提示词（ROW_DATA_PROMPT_TEMPLATE）—— 大模型生成一条数据主要靠这段文案 + 表字段 + 用户描述
 * 2. 工具定义（getToolDefinition）—— 给 model.bindTools() 用
 * 3. 执行逻辑在 AiService 中（需 DatabaseService 查表结构），此处只提供定义与提示词
 */

// ---------------------------------------------------------------------------
// 1. 提示词：生成一条数据全靠这一段 + 字段列表(fieldStr) + 控件说明(controls) + 用户描述(userInput)
// ---------------------------------------------------------------------------
export const ROW_DATA_PROMPT_TEMPLATE = `
你是一个专业的数据生成Agent。请根据用户的描述，生成一个严格的JSON格式数据。
【重要约束】
1. 必须直接输出JSON对象，不能包含任何多余的解释文本。
2. 绝对不能使用Markdown语法（绝对不要有 \`\`\`json 等代码块标记），输出的首字符必须是 '{{'。
3. 强制包含以下字段：{fieldStr}。

4. 字段 control 的值 **必须** 严格从 {controls} 中选择。

用户描述：{userInput}
结果：`.trim();

export const ROW_DATA_CONTROLS: Record<string, string> = {
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

// 生成数据时从表结构中排除的字段
export const ROW_DATA_EXCLUDED_FIELDS = [
  'id', 'create_time', 'create_by', 'create_dep_id',
  'update_time', 'update_by', 'tenant_id', 'ent_id', 'pk_id',
];

// ---------------------------------------------------------------------------
// 2. 工具定义：给 ChatOpenAI.bindTools(tools) 用
// 模型只传 description，modelId 由请求体传入，执行时由 AiService 注入
// ---------------------------------------------------------------------------
export function getToolDefinition() {
  return {
    type: 'function' as const,
    function: {
      name: 'generate_row_data',
      description: '在已有数据模型（表）下，根据用户描述生成一条数据记录。例如：用户说“帮我添加一个姓名字段”“生成一条员工请假单”“再来一条记录”时，且当前上下文有 modelId（在模型详情页）时调用此工具。',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: '用户本次的描述，例如：帮我添加一个姓名字段、生成一条员工请假数据',
          },
        },
        required: ['description'],
      },
    },
  };
}
