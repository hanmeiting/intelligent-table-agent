<template>
  <div class="table-create-container">
    <div class="header-section">
      <el-button @click="router.push('/')" circle class="back-btn">
        <el-icon><Back /></el-icon>
      </el-button>
      <h2>🤖 智能建表 Agent</h2>
    </div>
    
    <!-- 步骤一：输入自然语言 -->
    <el-card class="step-card" shadow="hover" v-if="step === 1">
      <template #header>
        <div class="card-header">
          <h3>第一步：告诉我想建什么表</h3>
        </div>
      </template>
      <el-input 
        v-model="description" 
        type="textarea"
        placeholder="例如：帮我创建一个员工表，包含基本信息..."
        :rows="6"
        resize="none"
      />
      <div class="actions mt-4">
        <el-button 
          type="primary" 
          size="large"
          :loading="loading" 
          :disabled="!description.trim()" 
          @click="generateSchema"
        >
          {{ loading ? '思考中...' : '生成表结构' }}
        </el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" show-icon class="mt-4" :closable="false" />
    </el-card>

    <!-- 步骤二：确认表结构 -->
    <el-card class="step-card" shadow="hover" v-if="step >= 2">
      <template #header>
        <div class="card-header">
          <h3>第二步：确认表信息</h3>
        </div>
      </template>
      
      <el-form label-width="140px" class="schema-form">
        <el-form-item label="数据表名 (英文):">
          <el-input v-model="schema.tableName" :disabled="step === 3" />
        </el-form-item>
        <el-form-item label="显示名称 (中文):">
          <el-input v-model="schema.displayName" :disabled="step === 3" />
        </el-form-item>
        <el-form-item label="表描述:">
          <el-input v-model="schema.description" :disabled="step === 3" />
        </el-form-item>
      </el-form>

      <div class="table-section">
        <h4>AI 推测的业务字段 (将存入 custom_data)</h4>
        <el-table :data="schema.businessFields" border style="width: 100%" stripe>
          <el-table-column prop="name" label="字段标识" width="180" />
          <el-table-column prop="comment" label="显示名称" width="180" />
          <el-table-column prop="control" label="控件类型">
            <template #default="{ row }">
              <el-tag type="info">{{ row.control }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="dataType" label="数据类型">
            <template #default="{ row }">
              <el-tag>{{ row.dataType }}</el-tag>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="暂无推测字段" :image-size="60" />
          </template>
        </el-table>
      </div>

      <div class="table-section mt-4">
        <h4>固定物理表字段结构</h4>
        <el-table :data="schema.fields" border style="width: 100%" stripe>
          <el-table-column prop="name" label="字段名" width="180" />
          <el-table-column prop="type" label="类型" width="150" />
          <el-table-column label="默认值/属性" width="200">
            <template #default="{ row }">
              <el-tag v-if="row.primaryKey" type="warning" effect="dark" class="mr-2">PK</el-tag>
              <el-tag v-if="row.autoIncrement" type="success" effect="dark" class="mr-2">AI</el-tag>
              <span v-if="row.defaultValue">{{ row.defaultValue }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="comment" label="说明" />
        </el-table>
      </div>

      <div class="actions mt-6" v-if="step === 2">
        <el-button size="large" @click="step = 1">返回修改</el-button>
        <el-button 
          type="primary" 
          size="large"
          :loading="loading" 
          @click="createTable"
        >
          {{ loading ? '创建中...' : '确认创建并插入示例数据' }}
        </el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" show-icon class="mt-4" :closable="false" />
    </el-card>

    <!-- 步骤三：创建结果 -->
    <el-card class="step-card success-card" shadow="never" v-if="step === 3">
      <el-result
        icon="success"
        title="🎉 创建成功"
      >
        <template #sub-title>
          <div class="result-msg">
            <p>{{ result.createMessage }}</p>
            <p v-if="result.sampleDataInserted">{{ result.insertMessage }}</p>
          </div>
        </template>
        <template #extra>
          <el-button type="primary" size="large" @click="router.push('/')">返回首页</el-button>
          <el-button size="large" @click="reset">继续创建新表</el-button>
        </template>
      </el-result>
    </el-card>

  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Back } from '@element-plus/icons-vue';

const router = useRouter();
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
  max-width: 900px;
  margin: 0 auto;
  padding: 40px 20px;
  min-height: 100vh;
  box-sizing: border-box;
}

.header-section {
  display: flex;
  align-items: center;
  margin-bottom: 30px;
}

.back-btn {
  margin-right: 15px;
}

.header-section h2 {
  margin: 0;
  font-size: 24px;
  color: #303133;
}

.step-card {
  margin-bottom: 24px;
  border-radius: 8px;
}

.card-header h3 {
  margin: 0;
  font-size: 18px;
  color: #303133;
}

.actions {
  display: flex;
  justify-content: flex-end;
}

.mt-4 {
  margin-top: 16px;
}

.mt-6 {
  margin-top: 24px;
}

.mr-2 {
  margin-right: 8px;
}

.schema-form {
  max-width: 600px;
  margin-bottom: 30px;
}

.table-section h4 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #606266;
  font-size: 16px;
}

.success-card {
  background-color: #f0f9eb;
  border-color: #e1f3d8;
}

.result-msg {
  color: #606266;
  font-size: 14px;
  line-height: 1.6;
}
.result-msg p {
  margin: 5px 0;
}
</style>
