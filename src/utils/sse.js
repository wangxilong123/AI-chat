/**
 * SSE（Server-Sent Events）增量解析器
 *
 * 解决的问题：网络分片边界与 SSE 事件边界无关，按 chunk 直接 split('\n')
 * 会把一条完整的 `data: {...}` 切断，导致 JSON.parse 失败、该段内容丢失。
 *
 * 规则：只有遇到空行（\n\n 或 \r\n\r\n）才认为一个事件结束，其余全部留在缓冲区。
 * 后端 AI-Chat-back/src/lib/sse.js 是同一份逻辑，改动时请同步。
 */

const DEFAULT_MAX_BUFFER = 1024 * 1024
const EVENT_SEPARATOR = /\r?\n\r?\n/

/**
 * 从单个事件的原始文本中提取 data 字段。
 * 按 SSE 规范：一个事件可以有多行 data:，用 \n 拼接；其余字段（event/id/retry/注释）忽略。
 * @param {string} rawEvent
 * @returns {string | null}
 */
function extractPayload(rawEvent) {
  const parts = []
  for (const line of rawEvent.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue
    let value = line.slice(5)
    if (value.startsWith(' ')) value = value.slice(1)
    parts.push(value)
  }
  return parts.length ? parts.join('\n') : null
}

/**
 * @param {(payload: string) => void} onData 每收到一个完整事件回调一次，payload 为 data 的内容
 * @param {{ maxBuffer?: number }} [options]
 */
export function createSSEParser(onData, options = {}) {
  const maxBuffer = options.maxBuffer ?? DEFAULT_MAX_BUFFER
  let buffer = ''
  let closed = false

  function emit(rawEvent) {
    const payload = extractPayload(rawEvent)
    if (payload !== null && payload !== '') onData(payload)
  }

  function drain() {
    let match
    while ((match = EVENT_SEPARATOR.exec(buffer)) !== null) {
      emit(buffer.slice(0, match.index))
      buffer = buffer.slice(match.index + match[0].length)
    }
    if (buffer.length > maxBuffer) {
      throw new Error(`SSE 缓冲区超过 ${maxBuffer} 字节仍无事件分隔符，疑似非法流`)
    }
  }

  return {
    /** 喂入一段已解码的文本 */
    push(text) {
      if (closed || !text) return
      buffer += text
      drain()
    },
    /** 流结束：把没有空行收尾的最后一段也处理掉 */
    end() {
      if (closed) return
      closed = true
      if (buffer.trim()) emit(buffer)
      buffer = ''
    }
  }
}
