import { defineStore } from 'pinia'
import { computed, reactive, ref } from 'vue'
import type { Message, Session, SessionRaw, MessageRaw } from '@/types/message'
import { getAllSessions, createSession as createSessionAPI, updateSessionTitle as updateSessionTitleAPI, deleteSession as deleteSessionAPI } from '@/api/session'
import { getSessionsHistoryById, chat as sendMessageAPI } from '@/api/message'
import { ElMessage } from 'element-plus'
import { chatStream } from '@/api/stream'
import { createSSEParser } from '@/utils/sse'

export const useChatStore = defineStore('chat', () => {
  // 状态
  const sessions = ref<Session[]>([])
  const currentSessionId = ref<string | null>(null)
  
  // 计算属性
  // 当前的对话
  const currentSession = computed(() => {
    return sessions.value.find(session => session.id === currentSessionId.value)
  })

  // 当前的消息列表
  const currentMessages = computed(() => {
    if (!currentSession.value) return []
    return currentSession.value.messages || []
  })

  // 生成 Message ID
  let msgSeq = 0
  const generateMessageId = (): string => {
    msgSeq += 1
    return `m_${Date.now().toString(36)}_${msgSeq}`
  }

  // 创建新会话
  const createSession = async () => {
    try {
      const res = await createSessionAPI()
      const newSession: Session = {
        id: res.data.id,
        title: res.data.title,
        messages: [],
        created_at: new Date(),
        updated_at: new Date()
      }
      sessions.value.push(newSession)
      currentSessionId.value = newSession.id
      console.log(sessions)
      return newSession
    } catch (error) {
      ElMessage.error('创建会话失败')
      throw error
    }
  }

  // 添加用户消息
  const addUserMessage = async (content: string) => {
    console.log('当前消息：', content)
    // 如果没有当前会话，创建一个
    if (!currentSession.value) {
      await createSession();
    }

    const session = currentSession.value
    if (!session) {
      throw new Error('会话不存在')
    }

    const sessionId = session.id

    const userMsg: Message = {
      id: generateMessageId(),
      session_id: sessionId,
      role: 'user',
      content: content,
      created_at: new Date(),
      status: 'sent'
    };

    // 添加到当前会话
    session.messages.push(userMsg)
    
    // 调用API
    try {
      const res = await sendMessageAPI(sessionId, content)
      console.log('API响应:', res) 

      const assistantMsg: Message = {
        id: generateMessageId(),
        session_id: sessionId,
        role: 'assistant',
        content: res.data.reply,
        created_at: new Date(),
        status: 'sent'
      }
      session.messages.push(assistantMsg)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '请求失败，请重试'
      const errorMsg: Message = {
        id: generateMessageId(),
        session_id: sessionId,
        role: 'assistant',
        content: '请求失败，请重试',
        created_at: new Date(),
        status: 'error',
        errorMsg: errorMessage
      }
      session.messages.push(errorMsg)
    }
  }

  const addUserMessageStream = async (content: string) => {
    console.log('当前消息：', content)
    // 如果没有当前会话，创建一个
    if (!currentSession.value) {
      await createSession()
    }

    const session = sessions.value.find(s => s.id === currentSessionId.value)

    if (!session) {
      throw new Error('会话不存在')
    }

    const sessionId = session.id

    // 添加用户消息
    const userMsg: Message = {
      id: generateMessageId(),
      session_id: sessionId,
      role: 'user',
      content,
      created_at: new Date(),
      status: 'sent'
    }
    session.messages.push(userMsg)

    // 创建 AI 消息占位（空内容）
    // 必须用 reactive 包一层：push 进响应式数组时存的是原始对象，
    // 直接改原始对象不会经过 proxy 的 set 陷阱，触发不了重新渲染
    //（表现为内容不显示、status 一直是 loading → 光标一直闪）
    const assistantMsg = reactive<Message>({
      id: generateMessageId(),
      session_id: sessionId,
      role: 'assistant',
      content: '',
      created_at: new Date(),
      status: 'loading'
    })
    session.messages.push(assistantMsg)

    // 调用流式 API
    try {
      const response = await chatStream(sessionId, content)

      if (!response.ok) {
        // 流式开始前出错时后端返回的是 JSON：{ error: '具体原因' }
        let message = `请求失败（HTTP ${response.status}）`
        try {
          const data = await response.json()
          if (data?.error) message = data.error
        } catch {
          // 响应不是 JSON，保留状态码提示
        }
        throw new Error(message)
      }
      if (!response.body) {
        throw new Error('响应体为空，请重试')
      }

      const body = response.body
      const reader = body.getReader()
      const decoder = new TextDecoder()

      // 用对象当容器：闭包里赋值时 TS 看不到外层变量被改过，直接用变量会被收窄
      const streamState: { error: Error | null } = { error: null }

      // 按 \n\n 切事件，避免一条 data 被网络分片切断后解析失败丢内容
      const parser = createSSEParser((payload) => {
        if (payload === '[DONE]') return
        try {
          const parsed = JSON.parse(payload)
          // 上游/后端的失败会以 error 字段下发，此时 HTTP 状态码已经是 200
          // error 既可能是字符串，也可能是 { message, type } 对象
          if (parsed.error) {
            const message = typeof parsed.error === 'string'
              ? parsed.error
              : parsed.error.message || 'AI 服务返回错误'
            streamState.error = new Error(message)
            return
          }
          if (parsed.content) {
            assistantMsg.content += parsed.content
          }
        } catch (e) {
          console.warn('SSE 数据解析失败，原文前 200 字：', payload.slice(0, 200))
        }
      })

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        parser.push(decoder.decode(value, { stream: true }))
        // 收到错误帧就不必继续读，主动断开，免得对着已经失败的上游干等
        if (streamState.error) {
          await reader.cancel().catch(() => {})
          break
        }
      }
      // 收尾：把解码器里残留的不完整多字节字符吐出来（中文跨分片时会卡在这）
      parser.push(decoder.decode())
      parser.end()

      if (streamState.error) throw streamState.error

      // 200 但一个 token 都没收到：这里原本会留下一个永远空着的空气泡
      if (!assistantMsg.content) {
        throw new Error('AI 没有返回任何内容，请重试')
      }

      // 流式结束，更新状态
      assistantMsg.status = 'sent'
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : '请求失败，请重试'
      // fetch 网络层失败抛的是 "Failed to fetch"，直接显示出来用户看不懂
      if (error instanceof TypeError && /fetch|network/i.test(errorMessage)) {
        errorMessage = '无法连接到服务器，请确认后端已启动'
      }
      // 已经收到部分内容时不要覆盖，否则用户看着看着内容会突然变成"请求失败"；
      // 一个字都没收到时保持内容为空，由 MessageBubble 用 errorMsg 单独渲染提示
      assistantMsg.status = 'error'
      assistantMsg.errorMsg = errorMessage
    }

  }

  const init = async () => {
    try {
      const res = await getAllSessions()
      if (res.data && res.data.length > 0) {
        sessions.value = res.data.map((item: SessionRaw) => ({
          ...item,
          messages: [],
          created_at: new Date(item.created_at),
          updated_at: new Date(item.updated_at)
        }))

        currentSessionId.value = sessions.value[0].id
        await loadMessages(sessions.value[0].id)
      } else {
        await createSession()
      }
    } catch (error) {
      await createSession()
    }
  }

  const loadMessages = async (sessionId: string) => {
    console.log('【前端】loadMessages 收到的 sessionId:', sessionId)
    try {
      const res = await getSessionsHistoryById(sessionId)
      const session = sessions.value.find(s => s.id === sessionId)

      if (session) {
        const messagesData = res.data || []
        if (Array.isArray(messagesData)) {
          session.messages = messagesData.map((m: MessageRaw) => ({
            ...m,
            id: String(m.id),
            created_at: new Date(m.created_at),
            status: 'sent' as const
          }))
        } else {
          console.error('消息数据格式错误:', messagesData)
          session.messages = []
        }
      }
    } catch (error) {
      console.error('加载消息失败:', error)
    }
  }

  // 切换会话
  const switchSession = async (sessionId: string) => {
    console.log('切换会话', sessionId)
    currentSessionId.value = sessionId
    const session = sessions.value.find(s => s.id === sessionId)
    if (!session) return
    console.log(session?.messages)
    // 无论会话是否有消息，都加载消息
    await loadMessages(sessionId)
  }

  const updateSessionTitle = async (sessionId: string, newTitle: string) => {
    try {
      await updateSessionTitleAPI(sessionId, newTitle)
      const session = sessions.value.find(s => s.id === sessionId)
      if (session) {
        session.title = newTitle
      }
    } catch (error) {
      ElMessage.error('修改标题失败')
      throw error
    }
  }

  const deleteSession = async (sessionId: string) => {
    try {
      await deleteSessionAPI(sessionId)
      // 从 sessions 数组中移除
      const index = sessions.value.findIndex(s => s.id === sessionId)
      if (index !== -1) {
        sessions.value.splice(index, 1)
      }

      if (currentSessionId.value === sessionId) {
        const nextSession = sessions.value[0]
        if (nextSession) {
          await switchSession(nextSession.id)
        } else {
          currentSessionId.value = null
        }
      }
    } catch (error) {
      ElMessage.error('删除会话失败')
      throw error
    }
  }

  return {
    // 属性
    sessions,
    currentSessionId,
    // 计算属性
    currentSession,
    currentMessages,
    // 方法
    createSession,
    addUserMessage,
    addUserMessageStream,
    init,
    switchSession,
    updateSessionTitle,
    deleteSession
  }
})