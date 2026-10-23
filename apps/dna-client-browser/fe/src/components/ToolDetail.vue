<script setup lang="ts">
// One tool call: full args and result, timings, context, cost, jev and Firecrawl calls, and its subagent runs.
import { onMounted, ref, watch } from "vue";
import { BadgeCheck, Search, Users } from "@lucide/vue";
import { k, ms, usd, type ToolCallDetail } from "@dna/sdk";
import { api, attempt } from "../client/store";
import { clean } from "../client/text";
import CopyJson from "./CopyJson.vue";
import JsonView from "./JsonView.vue";
import RunTree from "./RunTree.vue";
import LoadingRows from "./LoadingRows.vue";

const props = defineProps<{ id: number; depth?: number }>();
const detail = ref<ToolCallDetail>();
const load = async () => (detail.value = await attempt(() => api.toolCall(props.id)));
onMounted(load);
watch(() => props.id, load);
const at = (t?: number) =>
  t
    ? new Date(t).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }) + `.${String(t % 1000).padStart(3, "0")}`
    : "running";
</script>

<template>
  <div v-if="detail" class="tool-detail" :data-tool-detail="detail.id">
    <div class="node-head">
      <strong>{{ detail.toolName }}</strong>
      <span class="status" :class="detail.isError ? 'bad' : 'ok'">{{
        detail.isError ? "error" : detail.status
      }}</span>
      <span class="grow" />
      <CopyJson :value="detail" label="tool call" />
    </div>
    <dl class="facts-grid">
      <dt>Duration</dt>
      <dd data-field="duration">{{ ms(detail.durationMs) }}</dd>
      <dt>Started</dt>
      <dd data-field="started">{{ at(detail.startedAt) }}</dd>
      <dt>Ended</dt>
      <dd data-field="ended">{{ at(detail.endedAt) }}</dd>
      <dt>Context</dt>
      <dd data-field="context">{{ k(detail.contextTokens ?? 0) }} tokens</dd>
      <dt>Tokens</dt>
      <dd data-field="tokens">
        {{
          detail.generation
            ? `${k(detail.generation.inputTokens)} in, ${k(detail.generation.outputTokens)} out, ${k(detail.generation.cacheReadTokens)} cached`
            : "none"
        }}
      </dd>
      <dt>Cost</dt>
      <dd data-field="cost">
        {{ usd(detail.toolCostUsd + (detail.paidUsd ?? 0)) }} tool,
        {{ usd(detail.generation?.costUsd) }} generation
      </dd>
      <dt>Call</dt>
      <dd class="mono">{{ detail.callId }} task {{ detail.taskId }}</dd>
    </dl>
    <h4>Arguments</h4>
    <JsonView :value="detail.args" />
    <h4>Result</h4>
    <pre class="code" :class="{ bad: detail.isError }">{{ clean(detail.resultText ?? "") }}</pre>
    <template v-if="detail.jevCalls.length">
      <h4><BadgeCheck :size="14" />jev calls</h4>
      <div v-for="j in detail.jevCalls" :key="j.id" class="sub-row">
        <span class="mono">{{ j.command }}</span
        ><span v-if="j.error" class="status failed">failed</span><span>{{ ms(j.elapsedMs) }}</span
        ><span>{{ usd(j.costUsd) }}</span
        ><span>{{ j.attempts ?? 1 }} attempt</span> <span class="grow" /><CopyJson
          :value="j"
          label="jev call"
        />
        <p v-if="j.error" class="bad">{{ clean(j.error) }}</p>
        <JsonView v-else :value="j.answers" />
      </div>
    </template>
    <template v-if="detail.firecrawlCalls.length">
      <h4><Search :size="14" />Firecrawl calls</h4>
      <div v-for="f in detail.firecrawlCalls" :key="f.id" class="sub-row">
        <span class="mono">{{ f.endpoint }}</span
        ><span>{{ f.status }}</span
        ><span>{{ f.creditsUsed ?? 0 }} credits</span><span>{{ ms(f.elapsedMs) }}</span
        ><span class="muted">{{ clean(f.query ?? f.url ?? "") }}</span>
      </div>
    </template>
    <template v-if="detail.childRuns.length && (depth ?? 0) < 2">
      <h4><Users :size="14" />Subagent runs</h4>
      <RunTree
        v-for="r in detail.childRuns"
        :key="r.runEntryId"
        :id="r.runEntryId"
        :depth="(depth ?? 0) + 1"
      />
    </template>
  </div>
  <LoadingRows v-else kind="lines" :count="5" label="Loading the tool call" />
</template>
