<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { initDatabase, getAllStudents, getHistory, getSetting, weightedRandomSelect, addHistoryRecord } from './db';
import SettingsModal from './components/SettingsModal.vue';

export default {
  name: 'App',
  components: { SettingsModal },
  data() {
    return {
      students: [] as any[],
      history: [] as any[],
      selectedStudent: null as any,
      isSelecting: false,
      isAutoSelecting: false,
      showSettings: false,
      showFloating: false,
      showMainInterface: true,
      autoDuration: 5000,
      intervalId: null as number | null,
      stopTimeoutId: null as number | null,
      animationFrame: null as number | null,
      isAnimating: false,
    };
  },
  async mounted() {
    await initDatabase();
    await this.loadStudents();
    await this.loadHistory();
    await this.loadSettings();
  },
  beforeUnmount() {
    this.stopAutoSelect();
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
  },
  methods: {
    async loadStudents() {
      this.students = await getAllStudents();
    },
    async loadHistory() {
      this.history = await getHistory(50);
    },
    async loadSettings() {
      const duration = await getSetting('autoDuration');
      if (duration) this.autoDuration = parseInt(duration) || 5000;
    },
    getRandomStudentPreview() {
      if (this.students.length === 0) return null;
      return weightedRandomSelect(this.students);
    },
    async recordSelectedStudent() {
      if (this.students.length === 0) return;
      const selected = weightedRandomSelect(this.students);
      if (selected) {
        await addHistoryRecord(selected.id!, selected.name);
        this.selectedStudent = selected;
        await this.loadHistory();
        await this.loadStudents();
      }
    },
    startManualSelect() {
      if (this.students.length === 0) return;
      this.isSelecting = true;
      this.startAnimation();
    },
    stopManualSelect() {
      this.stopAnimation();
      this.recordSelectedStudent();
      this.isSelecting = false;
    },
    startAnimation() {
      this.isAnimating = true;
      const animate = () => {
        if (!this.isAnimating) return;
        this.selectedStudent = this.getRandomStudentPreview();
        const delay = Math.random() * 100 + 100;
        this.animationFrame = requestAnimationFrame(() => setTimeout(animate, delay));
      };
      animate();
    },
    stopAnimation() {
      this.isAnimating = false;
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
    },
    async startAutoSelect() {
      if (this.students.length === 0) return;
      this.isAutoSelecting = true;
      this.updatePreview();
      
      const scheduleNext = () => {
        if (!this.isAutoSelecting || this.students.length === 0) return;
        this.updatePreview();
        const delay = Math.random() * 100 + 100;
        this.intervalId = window.setTimeout(scheduleNext, delay) as unknown as number;
      };
      
      const initialDelay = Math.random() * 100 + 100;
      this.intervalId = window.setTimeout(scheduleNext, initialDelay) as unknown as number;
      
      this.stopTimeoutId = setTimeout(() => {
        this.stopAutoSelect();
      }, this.autoDuration) as unknown as number;
    },
    updatePreview() {
      if (this.students.length === 0) return;
      const preview = this.getRandomStudentPreview();
      if (preview) {
        this.selectedStudent = { ...preview };
        this.$forceUpdate();
      }
    },
    stopAutoSelect() {
      this.isAutoSelecting = false;
      if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
      }
      if (this.stopTimeoutId) {
        clearTimeout(this.stopTimeoutId);
        this.stopTimeoutId = null;
      }
      this.recordSelectedStudent();
    },
    showMain() {
      this.showMainInterface = true;
    },
    async toggleFloating() {
      try {
        if (this.showFloating) {
          await invoke('hide_floating_window');
        } else {
          await invoke('show_floating_window');
        }
        this.showFloating = !this.showFloating;
      } catch (error) {
        console.error('Failed to toggle floating window:', error);
      }
    },
    toggleMainInterface() {
      this.showMainInterface = !this.showMainInterface;
    },
  },
};
</script>

<template>
  <div class="app-container">
    <a-layout class="main-layout" v-show="showMainInterface">
      <a-layout-content class="content">
        <div class="main-area">
          <a-card>
            <template #title>
              <span class="card-title" @click="showSettings = true">随机点名器</span>
            </template>
            <div class="result-display">
              <a-typography-title :level="1">
                {{ selectedStudent ? selectedStudent.name : '请点击“开始抽取”按钮' }}
              </a-typography-title>
            </div>
            <div class="select-actions">
              <a-button v-if="!isSelecting" type="primary" size="large" @click="startManualSelect" :disabled="students.length === 0" class="large-button">
                开始抽取
              </a-button>
              <a-button v-else type="primary" danger size="large" @click="stopManualSelect" class="large-button">
                停止抽取
              </a-button>
              <a-button type="primary" size="large" @click="startAutoSelect" :disabled="students.length === 0 || isAutoSelecting" class="large-button">
                自动抽取
              </a-button>
              <a-button @click="toggleFloating" type="primary" size="large" class="large-button">
                {{ showFloating ? '隐藏悬浮窗' : '显示悬浮窗' }}
              </a-button>
            </div>
          </a-card>
        </div>
      </a-layout-content>
    </a-layout>

    <SettingsModal v-model:open="showSettings" @refresh="loadStudents" />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.app-container {
  min-height: 100vh;
  background: #f0f2f5;
}

.main-layout {
  min-height: 100vh;
}

.header {
  background: #001529;
  padding: 0 24px;
  display: flex;
  align-items: center;
}

.header-content {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-title {
  color: white;
  margin: 0;
  font-size: 20px;
}

.ant-card-head-title .card-title {
  font-size: 32px;
  font-weight: bold;
  color: inherit;
  cursor: default;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none !important;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.content {
  padding: 24px;
}

.main-area {
  display: flex;
  flex-direction: column;
  gap: 24px;
  text-align: center;
}

.result-display {
  padding: 30px 0;
  min-height: 180px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

.result-display .ant-typography h1,
.result-display .ant-typography-title {
  font-size: 48px !important;
  font-weight: bold;
}

.result-info {
  margin-top: 16px;
  display: flex;
  gap: 24px;
  color: #666;
}

.select-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  flex-wrap: wrap;
}

.large-button {
  height: 80px;
  padding: 0 48px;
  font-size: 22px;
  font-weight: 500;
}

.students-card {
  margin-top: 0;
}

.stats-row {
  margin-bottom: 16px;
  padding: 16px 0;
  border-bottom: 1px solid #f0f0f0;
}

.add-form {
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid #f0f0f0;
}

.history-time {
  font-size: 12px;
  color: #999;
}
</style>