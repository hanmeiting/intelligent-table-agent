<template>
  <div class="layout-container">
    <div :class="['main-content', { 'main-squeezed': isSidebarOpen }]">
      <div class="top-bar">
        <div style="display: flex; align-items: center; gap: 10px;">
          <el-button @click="router.push('/')" circle>
            <el-icon><Back /></el-icon>
          </el-button>
          <h2>{{ currentModel?.name || '加载中...' }} 数据表</h2>
        </div>
        <el-button type="primary" @click="toggleSidebar" v-if="!isSidebarOpen">
          <el-icon><ChatDotRound /></el-icon> 唤起 AI 助手
        </el-button>
      </div>
      <div class="table-container">
        <el-table :data="tableData" style="width: 100%" :row-class-name="tableRowClassName">
          <!-- 动态渲染列 -->
          <el-table-column
            v-for="field in tableColumns"
            :key="field.prop"
            :prop="field.prop"
            :label="field.label"
          />
        </el-table>
      </div>
    </div>
    <div :class="['sidebar', { 'sidebar-open': isSidebarOpen }]">
      <div class="sidebar-header">
        <h3>智能数据生成 Agent</h3>
        <el-button @click="toggleSidebar" circle size="small">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
      <div class="chat-container">
        <!-- Chat Area Placeholder -->
        <div class="messages" ref="messagesRef">
           <div class="message ai">
              你好，我是智能数据生成助手。请告诉我你想生成什么样的数据？或者上传相关参考图片。
           </div>
           <div v-for="(msg, index) in messages" :key="index" :class="['message', msg.role]">
             {{ msg.content }}
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
            <el-upload
              class="upload-demo"
              action="#"
              :auto-upload="false"
              :show-file-list="false"
            >
              <el-button type="info" plain size="small" style="margin-right: 10px;">
                <el-icon><Picture /></el-icon> 图片
              </el-button>
            </el-upload>
            <el-button type="primary" size="small" @click="sendQuery" :loading="isGenerating">发送</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Close, ChatDotRound, Picture, Back } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

const router = useRouter()
const route = useRoute()
const props = defineProps(['id'])

const isSidebarOpen = ref(false)
const inputText = ref('')
const isGenerating = ref(false)
const messages = ref([])
const messagesRef = ref(null)
const tableColumns = ref([
  {
    prop: 'name',
    label: '编码',
    align: 'center'
  },
  {
    prop: 'comment',
    label: '名称',
    align: 'center'
  },
  {
    prop: 'dataType',
    label: '类型',
    align: 'center'
  },
  {
    prop: 'control',
    label: '控件类型',
    align: 'center'
  }
])

const currentModel = ref(null)
const tableData = ref([])

onMounted(async () => {
  try {
    const res = await fetch(`/api/models/${route.params.id}`)
    const data = await res.json()
    currentModel.value = data
    tableData.value = data.fields.filter((item) => !item.isSystem) // 初始化空数据
  } catch (e) {
    console.error(e)
  }
})

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value
}

const scrollToBottom = async () => {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

// 供高亮显示生成中的数据行
const tableRowClassName = ({ row }) => {
  if (row.isGenerating) {
    return 'generating-row'
  }
  return ''
}

const sendQuery = async () => {
  if (!inputText.value.trim() || isGenerating.value || !currentModel.value) return
  
  const userText = inputText.value
  messages.value.push({ role: 'user', content: userText })
  inputText.value = ''
  isGenerating.value = true
  
  const aiMsg = { role: 'ai', content: '', streaming: true }
  messages.value.push(aiMsg)
  scrollToBottom()

  // 动态构造空行预览
  const tempRow = { isGenerating: true }
  currentModel.value.fields.forEach(f => tempRow[f.prop] = '')
  tableData.value.unshift(tempRow)

  try {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: userText }],
        modelId: route.params.id
      })
    })

    if (!response.ok) throw new Error('Network response was not ok')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let aiContent = ''
    
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      
      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const char = line.replace('data: ', '')
          aiContent += char
          aiMsg.content = aiContent
          scrollToBottom()
          
          try {
            const partialData = JSON.parse(aiContent + '}')
            currentModel.value.fields.forEach(f => {
               if(partialData[f.prop]) tableData.value[0][f.prop] = partialData[f.prop]
            })
          } catch (e) {
          }
        }
      }
    }
    
    aiMsg.streaming = false
    try {
      const finalData = JSON.parse(aiContent)
      currentModel.value.fields.forEach(f => {
         tableData.value[0][f.prop] = finalData[f.prop] || ''
      })
      delete tableData.value[0].isGenerating
      aiMsg.content = "已为您生成以下数据:\n" + JSON.stringify(finalData, null, 2)
      ElMessage.success('数据生成完毕！')
    } catch (e) {
      aiMsg.content = "生成完成，但数据解析失败"
      delete tableData.value[0].isGenerating
    }
    
  } catch (error) {
    console.error(error)
    aiMsg.content = "生成失败，请重试。"
    aiMsg.streaming = false
    tableData.value.shift() // 移除预览行
  } finally {
    isGenerating.value = false
  }
}
</script>

<style scoped>
.layout-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: #f5f7fa;
}

.sidebar {
  width: 0;
  background: white;
  border-left: 1px solid #dcdfe6;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -2px 0 8px rgba(0,0,0,0.05);
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

.input-area {
  padding: 16px;
  border-top: 1px solid #ebeef5;
  background: white;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 20px;
  transition: all 0.3s ease;
  min-width: 0;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.table-container {
  flex: 1;
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.05);
  overflow: auto;
}
.message.user {
  background-color: #409eff;
  color: white;
  align-self: flex-end;
  border-bottom-right-radius: 2px;
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

:deep(.generating-row) {
  background-color: #fdf6ec !important;
  transition: all 0.3s ease;
}
</style>
