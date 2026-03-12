<template>
  <div class="home-container">
    <div class="header">
      <h2 class="page-title">模型列表</h2>
      <div class="header-actions">
        <el-button type="success" plain @click="goToTableCreate" class="action-btn">
          <el-icon><Menu /></el-icon> 智能建表 Agent
        </el-button>
        <el-button type="primary" plain @click="toggleSidebar" class="action-btn">
          <el-icon><ChatDotRound /></el-icon> AI 生成新模型
        </el-button>
      </div>
    </div>
    
    <div class="model-list">
      <el-card v-for="model in modelList" :key="model.id" class="model-card" shadow="hover" @click="goToDetail(model.tableName)">
        <template #header>
          <div class="card-header">
            <span class="model-name">{{ model.name }}</span>
            <el-tag size="small" type="info">{{ model.tableName }}</el-tag>
          </div>
        </template>
        <div class="card-desc">{{ model.description || '暂无描述' }}</div>
        <div class="card-footer">
          <div class="field-count">字段数: <span class="count-num">{{ model.fields.length }}</span></div>
        </div>
      </el-card>
      
      <!-- Empty State -->
      <div v-if="modelList.length === 0" class="empty-state">
        <el-empty description="暂无模型，点击右上方按钮创建" />
      </div>
    </div>

    <!-- Right Sidebar for AI Generation -->
    <div :class="['sidebar', { 'sidebar-open': isSidebarOpen }]">
      <div class="sidebar-header">
        <h3>智能模型生成 Agent</h3>
        <el-button @click="toggleSidebar" circle size="small">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      <div class="chat-container">
        <div class="messages" ref="messagesRef">
           <div class="message ai">
              您好，请告诉我您想创建什么样的数据模型？例如：“创建一个员工表，包含姓名、年龄、入职时间”。
           </div>
           <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
             <pre v-if="msg.role === 'ai'" style="white-space: pre-wrap; font-family: inherit; margin: 0;">{{ msg.content }}</pre>
             <span v-else>{{ msg.content }}</span>
             <div v-if="msg.toolName" class="tool-tag">正在使用：{{ msg.toolName }}</div>
             <div v-if="msg.streaming" class="typing-indicator">...</div>
           </div>
        </div>
        <div class="input-area">
          <el-input 
            v-model="inputText" 
            type="textarea" 
            :rows="3" 
            placeholder="输入自然语言描述..." 
            resize="none"
            @keyup.enter.prevent="sendQuery"
            :disabled="isGenerating"
          />
          <div class="input-actions">
            <el-button type="primary" size="small" @click="sendQuery" :loading="isGenerating">生成</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Close, ChatDotRound, Menu } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const modelList = ref([])

const isSidebarOpen = ref(false)
const inputText = ref('')
const isGenerating = ref(false)
const messages = ref([])
const messagesRef = ref(null)

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const fetchModels = async () => {
  try {
    const res = await fetch('/api/models')
    const data = await res.json()
    modelList.value = data
  } catch (error) {
    console.error('Failed to fetch models', error)
  }
}

onMounted(() => {
  fetchModels()
})

const goToDetail = (id) => {
  router.push(`/model/${id}`)
}

const goToTableCreate = () => {
  router.push('/table-create')
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

const sendQuery = async () => {
  if (!inputText.value.trim() || isGenerating.value) return

  const userText = inputText.value
  messages.value.push({ role: 'user', content: userText })
  inputText.value = ''
  isGenerating.value = true

  const aiMsg = { role: 'ai', content: '', streaming: true, toolName: '' }
  messages.value.push(aiMsg)
  scrollToBottom()

  try {
    const response = await fetch('/api/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: userText }]
      })
    })

    if (!response.ok) throw new Error('Network response was not ok')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let streamContent = ''
    let lastPayload = null

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const text = decoder.decode(value, { stream: true })
      const lines = text.split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.replace(/^data: /, '').trim()
        if (!raw) continue
        try {
          const event = JSON.parse(raw)
          if (event.type === 'tool_call') {
            aiMsg.toolName = event.toolName || ''
            scrollToBottom()
          } else if (event.type === 'tool_stream' && event.chunk != null) {
            streamContent += event.chunk
            aiMsg.content = streamContent
            scrollToBottom()
          } else if (event.type === 'tool_result' && event.payload) {
            lastPayload = event.payload
          } else if (event.type === 'error') {
            aiMsg.content += '\n[错误] ' + (event.message || '')
            aiMsg.streaming = false
          } else if (event.type === 'done') {
            aiMsg.streaming = false
          }
        } catch (_) {
          // 非 JSON 行忽略
        }
      }
    }

    aiMsg.streaming = false
    if (lastPayload && lastPayload.tableName) {
      const newModel = {
        name: lastPayload.displayName || lastPayload.tableName,
        tableName: lastPayload.tableName,
        description: lastPayload.description || '',
        fields: lastPayload.fields || lastPayload.businessFields || []
      }
      const saveRes = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newModel)
      })
      if (saveRes.ok) {
        ElMessage.success('模型创建成功！')
        fetchModels()
        aiMsg.content = `模型【${newModel.name}】创建成功！`
      } else {
        aiMsg.content = streamContent || aiMsg.content || '[保存失败]'
      }
    } else if (streamContent) {
      try {
        const parsed = JSON.parse(streamContent)
        const newModel = {
          name: parsed.displayName || parsed.tableName,
          tableName: parsed.tableName,
          description: parsed.description || '',
          fields: parsed.fields || parsed.businessFields || []
        }
        const saveRes = await fetch('/api/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newModel)
        })
        if (saveRes.ok) {
          ElMessage.success('模型创建成功！')
          fetchModels()
          aiMsg.content = `模型【${newModel.name}】创建成功！`
        } else {
          aiMsg.content = streamContent
        }
      } catch (e) {
        aiMsg.content = streamContent || '[解析或保存失败]'
      }
    } else {
      aiMsg.content = aiMsg.content || '请求完成，无内容。'
    }
  } catch (error) {
    console.error(error)
    aiMsg.content = '生成失败，请重试。'
    aiMsg.streaming = false
  } finally {
    isGenerating.value = false
  }
}
</script>

<style scoped>
.home-container {
  padding: 30px;
  position: relative;
  height: 100vh;
  box-sizing: border-box;
  background-color: #f0f2f5;
  overflow: hidden;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px solid #e4e7ed;
}

.page-title {
  margin: 0;
  font-size: 24px;
  color: #303133;
  font-weight: 600;
}

.action-btn {
  margin-left: 12px;
}

.model-list {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  height: calc(100vh - 130px);
  overflow-y: auto;
  align-content: flex-start;
  padding-bottom: 40px;
}

.empty-state {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 60%;
}

.model-card {
  width: 320px;
  height: 180px;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: none;
}

:deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 20px;
}

:deep(.el-card__header) {
  padding: 15px 20px;
  background-color: #fafafa;
  border-bottom: 1px solid #f0f0f0;
}

.model-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.08) !important;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.model-name {
  font-weight: 600;
  color: #303133;
  font-size: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}

.card-desc {
  color: #606266;
  font-size: 14px;
  line-height: 1.5;
  margin-bottom: 15px;
  height: 42px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.card-footer {
  font-size: 13px;
  color: #909399;
  border-top: 1px dashed #ebeef5;
  padding-top: 12px;
  display: flex;
  justify-content: flex-end;
}

.field-count {
  display: flex;
  align-items: center;
}

.count-num {
  font-weight: 600;
  color: #409eff;
  margin-left: 4px;
  font-size: 14px;
}

/* Sidebar Styles reused from App.vue */
.sidebar {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: 0;
  background: white;
  border-left: 1px solid #dcdfe6;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -2px 0 8px rgba(0,0,0,0.05);
  z-index: 1000;
}

.sidebar-open {
  width: 400px;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #ebeef5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  white-space: nowrap;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.messages {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
}

.message {
  margin-bottom: 16px;
  padding: 10px 14px;
  border-radius: 8px;
  max-width: 80%;
  font-size: 14px;
  line-height: 1.5;
}

.message.ai {
  background-color: #f4f4f5;
  color: #303133;
  align-self: flex-start;
  border-bottom-left-radius: 2px;
}

.message.user {
  background-color: #409eff;
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 2px;
  margin-left: auto;
}

.input-area {
  padding: 16px;
  border-top: 1px solid #ebeef5;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
.tool-tag {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.typing-indicator {
  display: inline-block;
  animation: blink 1s infinite;
}

@keyframes blink {
  0% { opacity: .2; }
  20% { opacity: 1; }
  100% { opacity: .2; }
}
</style>