export interface Message {
  id: number,
  session_id: string
  role: 'user' | 'assistant',
  content: string,
  created_at: Date
  status: 'loading' | 'sent' | 'error'
  errorMsg?: string
}

export interface Session {
  id: string,
  title: string,
  messages: Message[]
  created_at: Date,
  updated_at: Date
}

// 后端接口返回的原始数据结构（时间字段是字符串，未经 Date 转换）
export interface SessionRaw {
  id: string,
  title: string,
  created_at: string,
  updated_at: string
}

export interface MessageRaw {
  id: number,
  session_id: string,
  role: 'user' | 'assistant',
  content: string,
  created_at: string
}