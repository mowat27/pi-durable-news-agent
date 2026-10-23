<script setup lang="ts">
// A sweep: phase timeline, counts, costs, the audit with missing steps highlighted, and its tool calls.
import { computed, onMounted, ref, watch } from "vue";
import { CircleCheck, CircleX } from "@lucide/vue";
import { ms, usd, type Sweep, type ToolCallRow } from "@dna/sdk";
import { go } from "../client/route";
import { api, attempt } from "../client/store";
import { clean } from "../client/text";
import CopyJson from "./CopyJson.vue";
import LoadingRows from "./LoadingRows.vue";

const props = defineProps<{ id: number }>();
const sweep = ref<Sweep & { toolCalls: ToolCallRow[] }>();
const load = async () => (sweep.value = (await attempt(() => api.sweep(props.id))) as never);
onMounted(load);
watch(() => props.id, load);
const span = computed(() => {
  const p = sweep.value?.phases ?? [];
  const start = Math.min(...p.map((x) => x.startedAt));
  const end = Math.max(...p.map((x) => x.endedAt ?? x.startedAt));
  return { start, total: Math.max(1, end - start) };
});
</script>

<template>
  <div v-if="sweep" class="sweep-detail" data-cap="sweeps.read" :data-sweep="sweep.id">
    <div class="node-head">
      <strong>Sweep {{ sweep.id }}</strong
      ><span class="status" :class="sweep.status">{{ sweep.status }}</span
      ><span>{{ sweep.trigger }}</span> <span class="grow" /><CopyJson
        :value="sweep"
        label="sweep"
      />
    </div>
    <dl class="facts-grid">
      <dt>Gathered</dt>
      <dd>{{ sweep.gathered }}</dd>
      <dt>jev kept</dt>
      <dd>{{ sweep.kept }}</dd>
      <dt>Duplicates</dt>
      <dd>{{ sweep.duplicates }}</dd>
      <dt>Candidates</dt>
      <dd>{{ sweep.candidates }}</dd>
      <dt>Presented</dt>
      <dd>{{ sweep.presented }}</dd>
      <dt>Model cost</dt>
      <dd>{{ usd(sweep.cost?.modelUsd) }}</dd>
      <dt>jev cost</dt>
      <dd>
        {{ usd(sweep.cost?.jevUsd) }} for {{ sweep.cost?.jevCalls ?? 0 }} calls<span
          v-if="sweep.cost?.jevFailed"
          class="bad"
          >, {{ sweep.cost.jevFailed }} failed</span
        >
      </dd>
      <dt>Images</dt>
      <dd>{{ usd(sweep.cost?.imageUsd) }}</dd>
      <dt>Firecrawl</dt>
      <dd>{{ sweep.firecrawlCreditsUsed }} credits, {{ sweep.searchMode }} mode</dd>
    </dl>
    <p v-if="sweep.summary" class="muted">{{ clean(sweep.summary) }}</p>
    <p v-if="sweep.reason || sweep.error" class="bad">
      {{ clean(sweep.reason ?? sweep.error ?? "") }}
    </p>
    <h4>Phases</h4>
    <div class="timeline-bars">
      <div v-for="p in sweep.phases" :key="p.phase" class="phase-bar" :class="p.status">
        <span class="phase-name">{{ p.phase }}</span>
        <span class="bar"
          ><i
            :style="{
              marginLeft: `${((p.startedAt - span.start) / span.total) * 100}%`,
              width: `${Math.max(1, (((p.endedAt ?? p.startedAt) - p.startedAt) / span.total) * 100)}%`,
            }"
        /></span>
        <span>{{ ms(p.endedAt ? p.endedAt - p.startedAt : undefined) }}</span>
        <span class="muted">{{ clean(p.note ?? "") }}</span>
      </div>
    </div>
    <template v-if="sweep.audit">
      <h4>Audit</h4>
      <div class="audit">
        <span
          v-for="step in sweep.audit.expected"
          :key="step"
          class="audit-step"
          :class="{ missing: sweep.audit.missing.includes(step) }"
        >
          <CircleX v-if="sweep.audit.missing.includes(step)" :size="13" /><CircleCheck
            v-else
            :size="13"
          />{{ step }}
        </span>
      </div>
    </template>
    <h4>Tool calls</h4>
    <button
      v-for="t in sweep.toolCalls"
      :key="t.id"
      class="tool-node-head"
      :class="{ bad: t.isError }"
      @click="go(`/executions/tool/${t.id}`)"
    >
      <span class="mono">{{ t.toolName }}</span
      ><span>{{ t.isError ? "error" : t.status }}</span
      ><span>{{ ms(t.durationMs) }}</span>
    </button>
  </div>
  <LoadingRows v-else kind="lines" :count="5" label="Loading the sweep" />
</template>
