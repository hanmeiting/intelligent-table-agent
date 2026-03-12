<template>
  <div class="table-create-container">
    <h2>🤖 智能建表 Agent</h2>
    
    <!-- 步骤一：输入自然语言 -->
    <div class="step-card" v-if="step === 1">
      <h3>第一步：告诉我想建什么表</h3>
      <textarea 
        v-model="description" 
        placeholder="例如：帮我创建一个员工表，包含基本信息..."
        rows="4"
      ></textarea>
      <button :disabled="loading || !description.trim()" @click="generateSchema">
        {{ loading ? '思考中...' : '生成表结构' }}
      </button>
      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>

    <!-- 步骤二：确认表结构 -->
    <div class="step-card" v-if="step >= 2">
      <h3>第二步：确认表信息</h3>
      
      <div class="schema-info">
        <div class="form-group">
          <label>数据表名 (英文):</label>
          <input type="text" v-model="schema.tableName" :disabled="step === 3" />
        </div>
        <div class="form-group">
          <label>显示名称 (中文):</label>
          <input type="text" v-model="schema.displayName" :disabled="step === 3" />
        </div>
        <div class="form-group">
          <label>表描述:</label>
          <input type="text" v-model="schema.description" :disabled="step === 3" />
        </div>
      </div>

      <h4>AI 推测的业务字段 (将存入 custom_data)</h4>
      <table class="schema-table">
        <thead>
          <tr>
            <th>字段标识</th>
            <th>显示名称</th>
            <th>控件类型</th>
            <th>数据类型</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(field, index) in schema.businessFields" :key="index">
            <td>{{ field.name }}</td>
            <td>{{ field.comment }}</td>
            <td><span>{{ field.control }}</span></td>
            <td><span class="tag tag-type">{{ field.dataType }}</span></td>
          </tr>
          <tr v-if="!schema.businessFields || schema.businessFields.length === 0">
            <td colspan="3" style="text-align: center; color: #999;">暂无推测字段</td>
          </tr>
        </tbody>
      </table>

      <h4>固定物理表字段结构</h4>
      <table class="schema-table">
        <thead>
          <tr>
            <th>字段名</th>
            <th>类型</th>
            <th>默认值/属性</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(field, index) in schema.fields" :key="index">
            <td>{{ field.name }}</td>
            <td>{{ field.type }}</td>
            <td>
              <span v-if="field.primaryKey" class="tag tag-pk">PK</span>
              <span v-if="field.autoIncrement" class="tag">AI</span>
              <span v-if="field.defaultValue">{{ field.defaultValue }}</span>
            </td>
            <td>{{ field.comment }}</td>
          </tr>
        </tbody>
      </table>

      <div class="actions" v-if="step === 2">
        <button class="btn-secondary" @click="step = 1">返回修改</button>
        <button :disabled="loading" @click="createTable">
          {{ loading ? '创建中...' : '确认创建并插入示例数据' }}
        </button>
      </div>
      <div v-if="error" class="error-msg">{{ error }}</div>
    </div>

    <!-- 步骤三：创建结果 -->
    <div class="step-card success" v-if="step === 3">
      <h3>🎉 创建成功</h3>
      <div class="result-msg">
        <p>{{ result.createMessage }}</p>
        <p v-if="result.sampleDataInserted">{{ result.insertMessage }}</p>
      </div>
      <button @click="reset">继续创建新表</button>
    </div>

  </div>
</template>

<script setup>
import { ref } from 'vue';

const step = ref(1);
const loading = ref(false);
const error = ref('');
const description = ref('');

const schema = ref(null);
const result = ref(null);

const generateSchema = async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/table/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description.value })
    });
    const data = await res.json();
    if (data.success) {
      schema.value = data.data;
      step.value = 2;
    } else {
      error.value = data.message || '生成失败';
    }
  } catch (e) {
    error.value = e.message || '网络错误';
  } finally {
    loading.value = false;
  }
};

const createTable = async () => {
  loading.value = true;
  error.value = '';
  try {
    const res = await fetch('/api/table/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(schema.value)
    });
    const data = await res.json();
    if (data.success) {
      result.value = data.data;
      step.value = 3;
    } else {
      error.value = data.message || '创建失败';
    }
  } catch (e) {
    error.value = e.message || '网络错误';
  } finally {
    loading.value = false;
  }
};

const reset = () => {
  step.value = 1;
  description.value = '';
  schema.value = null;
  result.value = null;
};
</script>

<style scoped>
.table-create-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.step-card {
  background: #fff;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  margin-bottom: 20px;
  text-align: left;
}

.step-card h3 {
  margin-top: 0;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
  color: #333;
}

textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  margin-bottom: 16px;
  font-family: inherit;
  resize: vertical;
}

button {
  background: #4CAF50;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.3s;
}

button:hover:not(:disabled) {
  background: #45a049;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-secondary {
  background: #f0f0f0;
  color: #333;
  margin-right: 12px;
}
.btn-secondary:hover:not(:disabled) {
  background: #e0e0e0;
}

.form-group {
  margin-bottom: 12px;
  display: flex;
  align-items: center;
}

.form-group label {
  width: 140px;
  font-weight: bold;
  color: #555;
}

.form-group input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.schema-table {
  width: 100%;
  border-collapse: collapse;
  margin: 16px 0;
}

.schema-table th, .schema-table td {
  border: 1px solid #ddd;
  padding: 10px;
  text-align: left;
}

.schema-table th {
  background: #f5f5f5;
  color: #333;
}

.tag {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  background: #eee;
  margin-right: 4px;
}

.tag-pk {
  background: #ffecb3;
  color: #f57c00;
  font-weight: bold;
}

.tag-type {
  background: #e3f2fd;
  color: #1976d2;
}

.actions {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.error-msg {
  color: #f44336;
  margin-top: 10px;
  padding: 10px;
  background: #ffebee;
  border-radius: 4px;
}

.result-msg {
  background: #e8f5e9;
  padding: 16px;
  border-radius: 4px;
  color: #2e7d32;
  margin-bottom: 20px;
}
</style>
