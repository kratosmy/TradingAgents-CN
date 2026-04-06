<template>
  <div class="watch-dashboard">
    <div class="page-header">
      <div>
        <h1 class="page-title">自选股监控</h1>
        <p class="page-subtitle">卡片流展示自选股摘要、风险判断和定时解读状态</p>
      </div>
      <div class="page-clock">
        <el-icon><Timer /></el-icon>
        <span>{{ currentTime }}</span>
      </div>
    </div>

    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <el-input
          v-model="searchQuery"
          placeholder="搜索股票代码或名称"
          clearable
          class="filter-search"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>

        <el-select v-model="riskLevel" placeholder="风险等级" clearable class="filter-select">
          <el-option label="未解读" value="未解读" />
          <el-option label="低风险" value="低风险" />
          <el-option label="中等" value="中等" />
          <el-option label="关注" value="关注" />
        </el-select>

        <el-select v-model="marketBoard" placeholder="市场板块" clearable class="filter-select">
          <el-option label="主板" value="主板" />
          <el-option label="创业板" value="创业板" />
          <el-option label="科创板" value="科创板" />
        </el-select>

        <el-button type="primary" :loading="refreshingAll" @click="handleRefreshAll">
          <el-icon><Refresh /></el-icon>
          一键全量解读
        </el-button>
      </div>
    </el-card>

    <div v-loading="loading" class="card-grid">
      <el-card v-for="card in filteredCards" :key="card.stock_code" class="watch-card" shadow="hover">
        <div class="watch-card__header">
          <div>
            <div class="stock-name-row">
              <span class="stock-name">{{ card.stock_name }}</span>
              <span class="stock-code">{{ card.stock_code }}</span>
            </div>
            <div class="stock-meta">
              <span class="stock-price" v-if="card.current_price !== null && card.current_price !== undefined">
                ¥{{ formatPrice(card.current_price) }}
              </span>
              <span v-else class="stock-price stock-price--empty">--</span>

              <span
                v-if="card.change_percent !== null && card.change_percent !== undefined"
                class="change-badge"
                :class="card.change_percent >= 0 ? 'change-badge--up' : 'change-badge--down'"
              >
                <el-icon><Top v-if="card.change_percent >= 0" /><Bottom v-else /></el-icon>
                {{ card.change_percent > 0 ? '+' : '' }}{{ card.change_percent.toFixed(2) }}%
              </span>
            </div>
          </div>
          <el-tag size="small" effect="plain">{{ card.market }}</el-tag>
        </div>

        <div class="watch-card__insight">
          <div class="watch-card__insight-title">
            <el-icon><Opportunity /></el-icon>
            <span>AI 解读摘要</span>
          </div>
          <p>{{ card.summary }}</p>
          <p v-if="card.recommendation" class="recommendation">建议：{{ card.recommendation }}</p>
        </div>

        <div class="watch-card__footer">
          <div class="watch-tags">
            <el-tag :type="riskTagType(card.risk_level)" effect="dark" size="small">
              {{ card.risk_level }}
            </el-tag>
            <el-tag :type="card.rule_status === 'active' ? 'info' : 'warning'" size="small">
              {{ card.schedule_label || '未配置' }}
            </el-tag>
            <el-tag v-if="card.board" size="small" effect="plain">{{ card.board }}</el-tag>
          </div>
          <span class="updated-at">{{ formatDateTime(card.updated_at) }}</span>
        </div>

        <div class="watch-card__actions">
          <el-button type="primary" plain @click="openRuleDialog(card)">配置策略</el-button>
          <el-button :loading="refreshingCodes.has(card.stock_code)" @click="handleRefresh(card)">重新解读</el-button>
          <el-button @click="openReport(card)" :disabled="!card.report_id">
            <el-icon><Document /></el-icon>
            完整报告
          </el-button>
        </div>
      </el-card>

      <el-card class="watch-card watch-card--add" shadow="never" @click="router.push('/favorites')">
        <el-icon class="add-icon"><Plus /></el-icon>
        <div class="add-title">从自选股中添加更多标的</div>
        <div class="add-subtitle">前往“我的自选股”添加股票后即可在这里监控</div>
      </el-card>
    </div>

    <el-empty v-if="!loading && !filteredCards.length" description="暂无可展示的监控卡片" />

    <el-dialog v-model="ruleDialogVisible" title="配置监控策略" width="480px">
      <el-form label-width="92px">
        <el-form-item label="股票">
          <div>{{ activeCard?.stock_name }}（{{ activeCard?.stock_code }}）</div>
        </el-form-item>
        <el-form-item label="策略状态">
          <el-switch v-model="ruleForm.status" active-value="active" inactive-value="inactive" />
        </el-form-item>
        <el-form-item label="执行频率">
          <el-select v-model="ruleForm.schedule_type" class="w-full">
            <el-option label="每天盘前" value="daily_pre_market" />
            <el-option label="每天盘后" value="daily_post_market" />
            <el-option label="盘中播报" value="intra_day" />
            <el-option label="每周复盘" value="weekly_review" />
          </el-select>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button
          v-if="activeCard?.schedule_type"
          type="danger"
          plain
          @click="handleDeleteRule"
        >
          删除策略
        </el-button>
        <el-button type="primary" :loading="savingRule" @click="handleSaveRule">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  Bottom,
  Document,
  Opportunity,
  Plus,
  Refresh,
  Search,
  Timer,
  Top,
} from '@element-plus/icons-vue'
import { watchDigestApi, type WatchDigestCard } from '@/api/watchDigest'

const router = useRouter()

const loading = ref(false)
const searchQuery = ref('')
const riskLevel = ref('')
const marketBoard = ref('')
const cards = ref<WatchDigestCard[]>([])
const refreshingAll = ref(false)
const refreshingCodes = ref(new Set<string>())
const currentTime = ref('')
const timer = ref<number | undefined>()

const ruleDialogVisible = ref(false)
const savingRule = ref(false)
const activeCard = ref<WatchDigestCard | null>(null)
const ruleForm = ref({
  status: 'active',
  schedule_type: 'daily_post_market',
})

const filteredCards = computed(() =>
  cards.value.filter((card) => {
    const keyword = searchQuery.value.trim().toLowerCase()
    const matchKeyword =
      !keyword ||
      card.stock_code.toLowerCase().includes(keyword) ||
      card.stock_name.toLowerCase().includes(keyword)
    const matchRisk = !riskLevel.value || card.risk_level === riskLevel.value
    const matchBoard = !marketBoard.value || card.board === marketBoard.value
    return matchKeyword && matchRisk && matchBoard
  }),
)

const loadCards = async () => {
  loading.value = true
  try {
    const response = await watchDigestApi.list()
    cards.value = response.data || []
  } catch (error: any) {
    ElMessage.error(error.message || '加载监控卡片失败')
  } finally {
    loading.value = false
  }
}

const openRuleDialog = (card: WatchDigestCard) => {
  activeCard.value = card
  ruleForm.value = {
    status: card.rule_status === 'active' ? 'active' : 'inactive',
    schedule_type: card.schedule_type || 'daily_post_market',
  }
  ruleDialogVisible.value = true
}

const handleSaveRule = async () => {
  if (!activeCard.value) return
  savingRule.value = true
  try {
    await watchDigestApi.saveRule(activeCard.value.stock_code, {
      stock_name: activeCard.value.stock_name,
      market: activeCard.value.market,
      status: ruleForm.value.status,
      schedule_type: ruleForm.value.schedule_type,
    })
    ElMessage.success('监控策略已保存')
    ruleDialogVisible.value = false
    await loadCards()
  } catch (error: any) {
    ElMessage.error(error.message || '保存策略失败')
  } finally {
    savingRule.value = false
  }
}

const handleDeleteRule = async () => {
  if (!activeCard.value) return
  savingRule.value = true
  try {
    await watchDigestApi.deleteRule(activeCard.value.stock_code)
    ElMessage.success('监控策略已删除')
    ruleDialogVisible.value = false
    await loadCards()
  } catch (error: any) {
    ElMessage.error(error.message || '删除策略失败')
  } finally {
    savingRule.value = false
  }
}

const handleRefresh = async (card: WatchDigestCard) => {
  refreshingCodes.value.add(card.stock_code)
  try {
    await watchDigestApi.refreshOne(card.stock_code, {
      stock_name: card.stock_name,
      market: card.market,
    })
    ElMessage.success(`已为 ${card.stock_name} 创建解读任务`)
  } catch (error: any) {
    ElMessage.error(error.message || '创建解读任务失败')
  } finally {
    refreshingCodes.value.delete(card.stock_code)
    refreshingCodes.value = new Set(refreshingCodes.value)
  }
}

const handleRefreshAll = async () => {
  refreshingAll.value = true
  try {
    const response = await watchDigestApi.refreshAll()
    ElMessage.success(`已批量创建 ${response.data?.count || 0} 个解读任务`)
  } catch (error: any) {
    ElMessage.error(error.message || '批量解读失败')
  } finally {
    refreshingAll.value = false
  }
}

const openReport = (card: WatchDigestCard) => {
  if (!card.report_id) {
    ElMessage.warning('该卡片还没有可跳转的完整报告')
    return
  }
  router.push(`/reports/view/${card.report_id}`)
}

const riskTagType = (risk: string) => {
  if (risk.includes('低')) return 'success'
  if (risk.includes('关注')) return 'warning'
  if (risk.includes('中')) return 'warning'
  return 'info'
}

const formatPrice = (price: number) => price.toFixed(2)

const formatDateTime = (value?: string | null) => {
  if (!value) return '尚未更新'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getMonth() + 1}-${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`
}

const updateClock = () => {
  currentTime.value = new Date().toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

onMounted(async () => {
  updateClock()
  timer.value = window.setInterval(updateClock, 1000)
  await loadCards()
})

onBeforeUnmount(() => {
  if (timer.value) {
    window.clearInterval(timer.value)
  }
})
</script>

<style lang="scss" scoped>
.watch-dashboard {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 16px;
}

.page-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--el-text-color-primary);
}

.page-subtitle {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
}

.page-clock {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.filter-card {
  :deep(.el-card__body) {
    padding: 18px;
  }
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.filter-search {
  flex: 1;
  min-width: 220px;
}

.filter-select {
  width: 150px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 20px;
}

.watch-card {
  border: 1px solid var(--el-border-color-lighter);

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
}

.watch-card__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.stock-name-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.stock-name {
  font-size: 18px;
  font-weight: 700;
}

.stock-code {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.stock-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
}

.stock-price {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.stock-price--empty {
  color: var(--el-text-color-secondary);
}

.change-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
}

.change-badge--up {
  background: rgba(103, 194, 58, 0.12);
  color: var(--el-color-success);
}

.change-badge--down {
  background: rgba(245, 108, 108, 0.12);
  color: var(--el-color-danger);
}

.watch-card__insight {
  background: var(--el-fill-color-light);
  border-radius: 10px;
  padding: 14px;

  p {
    margin: 0;
    line-height: 1.7;
    color: var(--el-text-color-regular);
    font-size: 13px;
  }

  .recommendation {
    margin-top: 8px;
    color: var(--el-text-color-primary);
    font-weight: 600;
  }
}

.watch-card__insight-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: var(--el-color-primary);
  font-size: 12px;
  font-weight: 700;
}

.watch-card__footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.watch-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.updated-at {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.watch-card__actions {
  display: flex;
  gap: 8px;

  .el-button {
    flex: 1;
  }
}

.watch-card--add {
  cursor: pointer;
  min-height: 320px;
  border-style: dashed;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;

  :deep(.el-card__body) {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    min-height: 100%;
  }
}

.add-icon {
  font-size: 28px;
  color: var(--el-color-primary);
}

.add-title {
  font-size: 16px;
  font-weight: 700;
}

.add-subtitle {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-select {
    width: 100%;
  }

  .watch-card__footer,
  .watch-card__actions {
    flex-direction: column;
    align-items: stretch;
  }

  .updated-at {
    align-self: flex-start;
  }
}
</style>

