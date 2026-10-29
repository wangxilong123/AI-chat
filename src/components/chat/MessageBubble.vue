<template>
  <div class="message-container" :class="role">
    <!-- 头像 -->
    <div class="avatar" :class="role">
      {{ role === 'user' ? 'U' : 'A' }}
    </div>
    
    <!-- 内容区域 -->
    <div class="message-content-area">
      <!-- 气泡：一个字都没收到时只显示下面的错误提示，不显示空气泡 -->
      <div
        v-if="!hideBubble"
        class="message-bubble"
        :class="[role, { 'is-error': status === 'error' }]"
      >
        <div class="message-content">
          <span v-if="renderedContent" class="markdown-body" v-html="renderedContent"></span>
          <template v-else>{{ content }}</template>
          <span v-if="status === 'loading'" class="cursor">|</span>
        </div>
      </div>

      <!-- 错误提示：可能一个字都没收到，所以不能放进气泡内部 -->
      <div v-if="status === 'error'" class="message-error">
        <el-icon class="error-icon"><WarningFilled /></el-icon>
        <span class="error-text">{{ errorMsg || '请求失败，请重试' }}</span>
      </div>
      
      <!-- 底部：时间 + 操作按钮 -->
      <div class="message-footer">

        <!-- AI消息：时间在左，操作按钮在右 -->
        <template v-if="role === 'assistant'">
          <span class="message-time">{{ formatTime(timestamp) }}</span>
          
          <div v-if="showOperations" class="message-operations">
            <el-tooltip content="复制" placement="bottom">
              <el-button @click="$emit('copy')" class="op-btn">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </el-tooltip>
            
            <el-tooltip content="重新生成" placement="bottom">
              <el-button @click="$emit('regenerate')" class="op-btn">
                <el-icon><Refresh /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
        </template>
        
        <!-- 用户消息：操作按钮在左，时间在右 -->
        <template v-else>
          <div v-if="showOperations" class="message-operations">
            <el-tooltip content="复制" placement="bottom">
              <el-button @click="$emit('copy')" class="op-btn">
                <el-icon><CopyDocument /></el-icon>
              </el-button>
            </el-tooltip>
            
            <el-tooltip content="重新生成" placement="bottom">
              <el-button @click="$emit('regenerate')" class="op-btn">
                <el-icon><Refresh /></el-icon>
              </el-button>
            </el-tooltip>
          </div>
          
          <span class="message-time">{{ formatTime(timestamp) }}</span>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { CopyDocument, Refresh, WarningFilled } from '@element-plus/icons-vue'
import { computed } from 'vue'
import { marked } from 'marked'

const props = defineProps({
  role: {
    type: String,
    default: 'user'
  },
  content: {
    type: String,
    default: '默认消息'
  },
  timestamp: {
    type: Date,
    default: () => new Date()
  },
  showOperations: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    default: 'sent'
  },
  // 失败原因，由 chatStore 在 catch 里写入；没有它错误就永远显示不出来
  errorMsg: {
    type: String,
    default: ''
  }
})

defineEmits(['copy', 'regenerate'])

// 失败且没收到任何内容时，气泡是空的，只保留错误提示
const hideBubble = computed(() => props.status === 'error' && !props.content)

const formatTime = (date) => {
  return new Date(date).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// 单换行转 <br>，更符合聊天场景
marked.setOptions({ breaks: true, gfm: true })

const renderedContent = computed(() => {
  // 用户消息保持纯文本，只有 AI 回复渲染 markdown
  if (props.role !== 'assistant') return null
  // 是AI，进行格式渲染
  return marked.parse(props.content || '')
})

</script>

<style scoped>
/* 主容器 */
.message-container {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 20px;
  width: 100%;
  max-width: 850px;
  margin: 0 auto;
}

/* 头像 */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 16px;
  flex-shrink: 0;
}

/* AI消息：头像在左 */
.message-container.assistant {
  justify-content: flex-start;
}

.message-container.assistant .avatar {
  order: 0;
}

.message-container.assistant .message-content-area {
  order: 1;
}

/* 用户消息：头像在右 */
.message-container.user {
  justify-content: flex-end;
}

.message-container.user .avatar {
  order: 1;
}

.message-container.user .message-content-area {
  order: 0;
}

.avatar.user {
  background: #409eff;
  color: white;
}

.avatar.assistant {
  background: #67c23a;
  color: white;
}

/* 内容区域 */
.message-content-area {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

/* AI消息：内容靠左 */
.message-container.assistant .message-content-area {
  align-items: flex-start;
}

/* 用户消息：内容靠左 */
.message-container.user .message-content-area {
  align-items: flex-end;
}

/* 气泡 */
.message-bubble {
  max-width: 100%;
  padding: 10px 14px;
  border-radius: 12px;
  word-break: break-word;
  overflow-wrap: break-word;
  white-space: pre-wrap;
  line-height: 1.5;
  font-size: 20px;
}

.message-bubble.user {
  background: #409eff;
  color: white;
  border-bottom-right-radius: 4px;
}

.message-bubble.assistant {
  background: #f0f2f5;
  color: #1f1f1f;
  border-bottom-left-radius: 4px;
}

/* 失败但已经收到部分内容：气泡保留内容，加一圈浅红边框提示不完整 */
.message-bubble.is-error {
  border: 1px solid #fde2e2;
}

/* 错误提示条 */
.message-error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  max-width: 100%;
  margin-top: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  color: #f56c6c;
  font-size: 15px;
  line-height: 1.5;
  white-space: normal;
  word-break: break-word;
}

.error-icon {
  flex-shrink: 0;
  margin-top: 2px;
  font-size: 16px;
}

.error-text {
  flex: 1;
  min-width: 0;
}

/* 内容文字 */
.message-content {
  display: inline-block;
  max-width: 100%;
}

/* 底部区域 */
.message-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  min-height: 24px;
}

/* 底部区域两端对齐 */
.message-container.assistant .message-footer,
.message-container.user .message-footer {
  justify-content: space-between;
}

/* 时间 */
.message-time {
  font-size: 14px;
  color: #999;
  order: 0;
}

/* 操作按钮 */
.message-operations {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
  order: 1;
}

/* 用户消息：时间在右（order:1），操作按钮在左（order:0） */
.message-container.user .message-time {
  order: 1;
}

.message-container.user .message-operations {
  order: 0;
}

.message-container:hover .message-operations {
  opacity: 1;
}

/* 操作按钮样式 */
.op-btn {
  padding: 4px 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: #999;
  transition: color 0.2s;
}

.op-btn:hover {
  color: #409eff;
}

.op-btn .el-icon {
  font-size: 18px;
}

/* 悬停效果 */
.message-bubble {
  transition: transform 0.2s ease;
}

.message-container:hover .message-bubble {
  transform: translateY(-1px);
}

.cursor {
  animation: blink 1s infinite;
}
@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.message-bubble {
  white-space: normal;   /* 原来是 pre-wrap */
}

/* 基础排版 */
.message-bubble :deep(.markdown-body) { display: block; }
.message-bubble :deep(p) { margin: 0 0 8px; }
.message-bubble :deep(p:last-child) { margin-bottom: 0; }
.message-bubble :deep(ul),
.message-bubble :deep(ol) { padding-left: 20px; margin: 8px 0; }
.message-bubble :deep(h1),
.message-bubble :deep(h2),
.message-bubble :deep(h3) { margin: 12px 0 8px; line-height: 1.3; }

/* 行内代码 */
.message-bubble :deep(code) {
  background: rgba(0,0,0,.06);
  padding: 2px 5px;
  border-radius: 4px;
  font-family: Consolas, Monaco, monospace;
  font-size: .9em;
}

/* 代码块 */
.message-bubble :deep(pre) {
  background: #282c34;
  color: #e6e6e6;
  padding: 12px;
  border-radius: 8px;
  overflow-x: auto;
  margin: 8px 0;
}
.message-bubble :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

/* 表格 */
.message-bubble :deep(table) { border-collapse: collapse; margin: 8px 0; }
.message-bubble :deep(th),
.message-bubble :deep(td) { border: 1px solid #dcdfe6; padding: 6px 10px; }

</style>