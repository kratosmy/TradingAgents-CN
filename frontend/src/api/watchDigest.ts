import { ApiClient } from './request'

export interface WatchDigestRule {
  stock_code: string
  stock_name?: string
  market?: string
  schedule_type: string
  schedule_label?: string
  cron_expr?: string | null
  status: string
  updated_at?: string | null
}

export interface WatchDigestCard {
  stock_code: string
  stock_name: string
  market: string
  board?: string | null
  exchange?: string | null
  current_price?: number | null
  change_percent?: number | null
  summary: string
  recommendation?: string | null
  risk_level: string
  confidence_score?: number | null
  schedule_type?: string | null
  schedule_label?: string
  rule_status: string
  updated_at?: string | null
  report_id?: string | null
  task_id?: string | null
}

export const watchDigestApi = {
  list: () => ApiClient.get<WatchDigestCard[]>('/api/watch/digests'),

  listRules: () => ApiClient.get<WatchDigestRule[]>('/api/watch/rules'),

  saveRule: (
    stockCode: string,
    payload: {
      stock_name?: string
      market?: string
      schedule_type: string
      cron_expr?: string | null
      status: string
    }
  ) => ApiClient.put<WatchDigestRule>(`/api/watch/rules/${stockCode}`, payload),

  deleteRule: (stockCode: string) => ApiClient.delete<{ stock_code: string }>(`/api/watch/rules/${stockCode}`),

  refreshOne: (stockCode: string, payload: { stock_name: string; market?: string }) =>
    ApiClient.post<{ task_id: string; status: string; message: string }>(`/api/watch/digests/${stockCode}/refresh`, payload),

  refreshAll: () => ApiClient.post<{ count: number; stocks: string[] }>('/api/watch/digests/refresh-all'),
}
