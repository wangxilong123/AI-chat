<template>
  <div class="chat-container">
    <div class="messages-area">

      <!-- 空状态 -->
      <div v-if="messages.length === 0" class="empty-state">
        <el-icon :size="60"><ChatDotRound /></el-icon>
        <p>还没有消息</p>
        <p>发送消息开始对话</p>
      </div>

      <!-- 消息列表 -->
      <template v-else>
        <div v-for="item in messages" :key="item.id" class="message-item" :class="item.role">
          <div class="message-wrapper">
            <message-bubble
              :role="item.role"
              :content="item.content"
              :timestamp="item.created_at"
              :status="item.status"
            />
          </div>
        </div>
      </template>
    </div>
    
    <div class="input-area">
      <InputArea 
        v-model="inputText"
        @send="handleSend"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { ChatDotRound } from '@element-plus/icons-vue'
import InputArea from './InputArea.vue'
import MessageBubble from './MessageBubble.vue'
import { useChatStore } from '@/store/chatStore'

const chatStore = useChatStore()
const inputText = ref('')

const messages = computed(() => chatStore.currentMessages)

const handleSend = () => {
  if (!inputText.value.trim()) return
  
  // chatStore.addUserMessage(inputText.value.trim())
  chatStore.addUserMessageStream(inputText.value.trim())
  inputText.value = ''
}
</script>

<style scoped>
.chat-container {
  flex: 1;
  height: 100%;
  margin: 0 20px;
  display: flex;
  flex-direction: column;
  background: white;
  border-radius: 8px;
}

.messages-area {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  width: 100%;
}

.messages-area::-webkit-scrollbar {
  width: 10px;
}

.messages-area::-webkit-scrollbar-track {
  background: transparent;
}

.message-item {
  width: 100%;
}

.message-wrapper {
  width: 100%;
}

.input-area {
  background: white;
  display: flex;
  max-width: 900px;
  margin: 0 auto;
  margin-bottom: 20px;
  width: 100%;
}

/* 空状态样式 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #999;
  gap: 10px;
}
.empty-state p {
  font-size: 16px;
  margin: 0;
}
</style>
