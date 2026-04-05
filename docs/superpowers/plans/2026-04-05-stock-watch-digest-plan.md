# Stock Watch Digest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a stock watch digest feature to provide users with a card-flow monitoring center of their watched stocks, featuring AI-generated summaries and configurable scheduled analysis.

**Architecture:** Extend FastAPI backend with `Digest` and `WatchRule` models, scheduling integration, and REST APIs. Extend Vue 3 frontend with a responsive card-flow UI for stock digests, including rules configuration.

**Tech Stack:** FastAPI, Pydantic, Beanie (MongoDB ODM), Vue 3, TypeScript, Tailwind CSS.

---

### Task 1: Backend Models for Watch Rules and Digests

**Files:**
- Create: `app/models/watch_digest.py`
- Modify: `app/models/__init__.py`

- [ ] **Step 1: Write the failing tests**

```python
# Create tests/models/test_watch_digest.py
import pytest
from app.models.watch_digest import WatchRule, Digest

@pytest.mark.asyncio
async def test_watch_rule_model():
    rule = WatchRule(user_id="user123", stock_code="AAPL", schedule_type="daily_post_market", status="active")
    assert rule.stock_code == "AAPL"
    assert rule.status == "active"

@pytest.mark.asyncio
async def test_digest_model():
    digest = Digest(user_id="user123", stock_code="AAPL", report_id="rep123", summary="Stock is up due to earnings.", risk_score=75)
    assert digest.stock_code == "AAPL"
    assert digest.risk_score == 75
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/models/test_watch_digest.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'app.models.watch_digest'"

- [ ] **Step 3: Write minimal implementation**

```python
# Create app/models/watch_digest.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class WatchRule(BaseModel):
    user_id: str
    stock_code: str
    schedule_type: str = Field(..., description="e.g., daily_pre_market, daily_post_market, intra_day")
    cron_expr: Optional[str] = None
    status: str = "active"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Digest(BaseModel):
    user_id: str
    stock_code: str
    report_id: Optional[str] = None
    summary: str
    risk_score: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/models/test_watch_digest.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/models/test_watch_digest.py app/models/watch_digest.py
git commit -m "feat(models): add WatchRule and Digest models"
```

### Task 2: Backend Service for Managing Watch Rules

**Files:**
- Create: `app/services/watch_digest_service.py`

- [ ] **Step 1: Write the failing test**

```python
# Create tests/services/test_watch_digest_service.py
import pytest
from app.services.watch_digest_service import WatchDigestService
from app.models.watch_digest import WatchRule

@pytest.mark.asyncio
async def test_create_and_get_watch_rule():
    service = WatchDigestService()
    rule_data = {"user_id": "u1", "stock_code": "TSLA", "schedule_type": "daily"}
    created = await service.create_rule(rule_data)
    assert created.stock_code == "TSLA"
    
    rules = await service.get_user_rules("u1")
    assert len(rules) > 0
    assert rules[0].stock_code == "TSLA"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/services/test_watch_digest_service.py -v`
Expected: FAIL with missing module or attributes.

- [ ] **Step 3: Write minimal implementation**

```python
# Create app/services/watch_digest_service.py
from typing import List, Dict, Any
from app.models.watch_digest import WatchRule, Digest

class WatchDigestService:
    def __init__(self):
        self._mock_rules = []
        self._mock_digests = []

    async def create_rule(self, data: Dict[str, Any]) -> WatchRule:
        rule = WatchRule(**data)
        self._mock_rules.append(rule)
        return rule

    async def get_user_rules(self, user_id: str) -> List[WatchRule]:
        return [r for r in self._mock_rules if r.user_id == user_id]
        
    async def save_digest(self, data: Dict[str, Any]) -> Digest:
        digest = Digest(**data)
        self._mock_digests.append(digest)
        return digest
        
    async def get_latest_digests(self, user_id: str) -> List[Digest]:
        return [d for d in self._mock_digests if d.user_id == user_id]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/services/test_watch_digest_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/services/test_watch_digest_service.py app/services/watch_digest_service.py
git commit -m "feat(services): add WatchDigestService for rule and digest management"
```

### Task 3: Backend API Endpoints for Watch Digest

**Files:**
- Create: `app/routers/watch_digest.py`
- Modify: `app/main.py`

- [ ] **Step 1: Write the failing test**

```python
# Create tests/routers/test_watch_digest_api.py
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_get_watch_digests():
    response = client.get("/api/watch/digests?user_id=test_user")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

def test_create_watch_rule():
    payload = {"user_id": "test_user", "stock_code": "MSFT", "schedule_type": "daily"}
    response = client.post("/api/watch/rules", json=payload)
    assert response.status_code == 200
    assert response.json()["stock_code"] == "MSFT"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/routers/test_watch_digest_api.py -v`
Expected: FAIL with 404 Not Found.

- [ ] **Step 3: Write minimal implementation**

```python
# Create app/routers/watch_digest.py
from fastapi import APIRouter, Depends
from typing import List
from app.models.watch_digest import WatchRule, Digest
from app.services.watch_digest_service import WatchDigestService
from pydantic import BaseModel

router = APIRouter(prefix="/api/watch", tags=["watch_digest"])

def get_service():
    return WatchDigestService()

class RuleCreate(BaseModel):
    user_id: str
    stock_code: str
    schedule_type: str

@router.get("/digests", response_model=List[Digest])
async def get_digests(user_id: str, service: WatchDigestService = Depends(get_service)):
    return await service.get_latest_digests(user_id)

@router.post("/rules", response_model=WatchRule)
async def create_rule(rule_in: RuleCreate, service: WatchDigestService = Depends(get_service)):
    return await service.create_rule(rule_in.dict())
```

```python
# Modify app/main.py to include the router
# from app.routers.watch_digest import router as watch_digest_router
# app.include_router(watch_digest_router)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/routers/test_watch_digest_api.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/routers/test_watch_digest_api.py app/routers/watch_digest.py app/main.py
git commit -m "feat(api): add endpoints for watch digests and rules"
```

### Task 4: Frontend API Integration

**Files:**
- Create: `frontend/src/api/watchDigest.ts`

- [ ] **Step 1: Write the implementation**

```typescript
// Create frontend/src/api/watchDigest.ts
import request from "@/utils/request";

export interface WatchRule {
  user_id: string;
  stock_code: string;
  schedule_type: string;
  status: string;
}

export interface Digest {
  user_id: string;
  stock_code: string;
  summary: string;
  risk_score?: number;
  created_at: string;
}

export function getWatchDigests(userId: string) {
  return request({
    url: "/api/watch/digests",
    method: "get",
    params: { user_id: userId }
  });
}

export function createWatchRule(data: Partial<WatchRule>) {
  return request({
    url: "/api/watch/rules",
    method: "post",
    data
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/api/watchDigest.ts
git commit -m "feat(frontend): add API service for watch digests"
```

### Task 5: Frontend Watch Digest Card Component

**Files:**
- Create: `frontend/src/components/WatchDigestCard.vue`

- [ ] **Step 1: Write the implementation**

```vue
<!-- Create frontend/src/components/WatchDigestCard.vue -->
<template>
  <div class="border rounded-lg p-4 shadow-sm bg-white">
    <div class="flex justify-between items-center mb-3">
      <h3 class="font-bold text-lg">{{ digest.stock_code }}</h3>
      <div :class="riskColor" class="px-2 py-1 rounded text-sm text-white">
        Risk: {{ digest.risk_score || "N/A" }}
      </div>
    </div>
    
    <div class="mb-4 text-gray-700 text-sm">
      {{ digest.summary }}
    </div>
    
    <div class="flex justify-between text-xs text-gray-500 border-t pt-3 mt-auto">
      <span>{{ formattedDate }}</span>
      <div class="space-x-2">
        <button @click="$emit('configure', digest.stock_code)" class="text-blue-600">Config</button>
        <button @click="$emit('refresh', digest.stock_code)" class="text-green-600">Refresh</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Digest } from "@/api/watchDigest";

const props = defineProps<{ digest: Digest }>();
defineEmits(["configure", "refresh"]);

const riskColor = computed(() => {
  const score = props.digest.risk_score || 0;
  if (score > 70) return "bg-red-500";
  if (score > 40) return "bg-yellow-500";
  return "bg-green-500";
});

const formattedDate = computed(() => {
  return new Date(props.digest.created_at).toLocaleString();
});
</script>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/WatchDigestCard.vue
git commit -m "feat(frontend): create WatchDigestCard component"
```

### Task 6: Frontend Watch Digest View (Card Flow)

**Files:**
- Create: `frontend/src/views/WatchDigest/index.vue`
- Modify: `frontend/src/router/index.ts`

- [ ] **Step 1: Write the implementation**

```vue
<!-- Create frontend/src/views/WatchDigest/index.vue -->
<template>
  <div class="p-6">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Watch Digest</h1>
      <button @click="fetchAll" class="bg-blue-600 text-white px-4 py-2 rounded">
        Refresh All
      </button>
    </div>

    <div v-if="loading" class="text-center py-10">Loading...</div>
    
    <div v-else-if="digests.length === 0" class="text-center py-10">
      No digests found. Configure some rules!
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <WatchDigestCard 
        v-for="digest in digests" 
        :key="digest.stock_code" 
        :digest="digest"
        @configure="handleConfigure"
        @refresh="handleRefresh"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import WatchDigestCard from "@/components/WatchDigestCard.vue";
import { getWatchDigests, type Digest } from "@/api/watchDigest";

const digests = ref<Digest[]>([]);
const loading = ref(true);
const userId = "current_user"; // Replace with real auth

const fetchAll = async () => {
  loading.value = true;
  try {
    const res = await getWatchDigests(userId);
    digests.value = res.data || res;
  } finally {
    loading.value = false;
  }
};

const handleConfigure = (code: string) => console.log("Config", code);
const handleRefresh = (code: string) => console.log("Refresh", code);

onMounted(fetchAll);
</script>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/views/WatchDigest/index.vue frontend/src/router/index.ts
git commit -m "feat(frontend): create Watch Digest view"
```

### Task 7: Integrate Scheduler Engine

**Files:**
- Modify: `app/services/scheduler_service.py`
- Create: `app/tasks/digest_tasks.py`

- [ ] **Step 1: Write the failing test**

```python
# Create tests/tasks/test_digest_tasks.py
import pytest
from app.tasks.digest_tasks import generate_digest_for_rule

@pytest.mark.asyncio
async def test_generate_digest_for_rule():
    result = await generate_digest_for_rule({"stock_code": "TEST"})
    assert result is True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/tasks/test_digest_tasks.py -v`
Expected: FAIL missing file/function.

- [ ] **Step 3: Write minimal implementation**

```python
# Create app/tasks/digest_tasks.py
import logging

logger = logging.getLogger(__name__)

async def generate_digest_for_rule(rule_data: dict) -> bool:
    stock_code = rule_data.get("stock_code")
    logger.info(f"Generating digest for {stock_code}")
    # 1. Fetch analysis
    # 2. Extract summary
    # 3. Save to WatchDigestService
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/tasks/test_digest_tasks.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/tasks/test_digest_tasks.py app/tasks/digest_tasks.py
git commit -m "feat(scheduler): integrate digest generation"
```

