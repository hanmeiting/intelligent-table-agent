import { Injectable, Logger } from '@nestjs/common';
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
const controls = {
  "rx-input": '单行文本',
  "rx-radio": '单选框',
  "rx-textarea": '单行文本',
  "rx-checkbox-list": '复选框',
  "rx-form-select": '下拉框',
  "rx-date": '日期',
  "rx-time": '时间',
  "rx-number": '数字',
  "rx-switch": '开关'
}
@Injectable()
export class TableGeneratorService {
  private readonly logger = new Logger(TableGeneratorService.name);

  // 预留的系统字段
  private readonly fixedSchemaTemplate = [
    { name: 'id', fieldName: 'F_id', type: 'INT', dataType: 'number', primaryKey: true, autoIncrement: true, comment: '主键ID', isSystem: true, control: 'rx-input' },
    { name: 'created_at', fieldName: 'F_created_at', type: 'DATETIME', dataType: 'datetime', defaultValue: 'CURRENT_TIMESTAMP', comment: '创建时间', isSystem: true, control: 'rx-date' },
    { name: 'updated_at', fieldName: 'F_updated_at', type: 'DATETIME', dataType: 'datetime', defaultValue: 'CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', comment: '更新时间', isSystem: true, control: 'rx-date' },
    { name: 'is_deleted', fieldName: 'F_is_deleted', type: 'TINYINT', dataType: 'number', length: 1, defaultValue: '0', comment: '是否删除', isSystem: true, control: 'rx-input' }
  ];

  async generateTableSchema(description: string) {
    const apiKey = process.env.OPENAI_API_KEY || 'sk-placeholder';
    const baseUrl = process.env.OPENAI_BASE_URL;
    const modelName = process.env.MODEL_NAME || 'gpt-3.5-turbo';

    try {
      const model = new ChatOpenAI({
        openAIApiKey: apiKey,
        configuration: baseUrl ? { baseURL: baseUrl } : undefined,
        modelName: modelName,
      });

      const prompt = PromptTemplate.fromTemplate(
        "你是一个专业的数据库架构师。用户会用自然语言要求创建一张表。物理表结构是固定的，但你需要推断出用户想要的【具体业务字段】。\n" +
        "请严格返回JSON格式数据，不要使用Markdown代码块（如```json），只输出原始JSON字符串。\n" +
        "返回的JSON必须包含以下结构：\n" +
        "{{\n" +
        "  \"tableName\": \"英文表名（如：employee_leaves），请使用复数形式和小写加下划线命名法\",\n" +
        "  \"displayName\": \"中文表名（如：员工请假表）\",\n" +
        "  \"description\": \"表的作用描述\",\n" +
        "  \"businessFields\": [\n" +
        "    {{\n" +
        "      \"name\": \"字段编码(如：name)\",\n" +
        "      \"fieldName\": \"字段名称(如：F_name)\",\n" +
        "      \"comment\": \"多行文本(如：姓名)\",\n" +
        "      \"type\": \"数据库物理类型(如：VARCHAR/INT/DATETIME/TEXT)\",\n" +
        "      \"dataType\": \"前端字段类型(clob/varchar/number/date等)\",\n" +
        "      \"length\": \"字段长度(如：255，可为null)\",\n" +
        "      \"decimalLength\": \"小数位数(可为null)\",\n" +
        "      \"control\": \"控件类型,必须从{controls}中选择\",\n" +
        "      \"isSingle\": 1,\n" +
        "      \"publishStatus\": \"DEPLOYED\",\n" +
        "      \"extJson\": \"\"\n" +
        "    }}\n" +
        "  ]\n" +
        "}}\n\n" +
        "用户描述：{userInput}\n" +
        "结果："
      );

      const chain = prompt.pipe(model).pipe(new StringOutputParser());
      const result = await chain.invoke({ userInput: description, controls: JSON.stringify(controls) });

      const parsedResult = JSON.parse(result.trim());

      const businessFields = (parsedResult.businessFields || []).map((f: any) => ({
        ...f,
        isSystem: false,
        type: f.type || 'VARCHAR',
      }));

      // Combine fixed schema and business fields to form the full table schema
      const allFields = [...this.fixedSchemaTemplate, ...businessFields];

      return {
        ...parsedResult,
        businessFields,
        fields: allFields
      };

    } catch (error) {
      this.logger.error('Failed to generate table schema from LLM', error);
      // 降级处理
      const fallbackBusinessFields = [
        {
          name: 'name',
          fieldName: 'F_name',
          comment: '名称',
          type: 'VARCHAR',
          dataType: 'varchar',
          length: 255,
          control: 'rx-input',
          isSystem: false
        }
      ];

      return {
        tableName: 'dynamic_table_' + Date.now(),
        displayName: '自定义表',
        description: '根据需求生成的表',
        businessFields: fallbackBusinessFields,
        fields: [...this.fixedSchemaTemplate, ...fallbackBusinessFields]
      };
    }
  }
}
