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
                {{ selectedStudent ? selectedStudent.name : '暂无数据' }}
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

          <a-card class="students-card" title="学生列表">
            <template #extra>
              <a-space>
                <a-button size="small" @click="showImport = true">导入</a-button>
                <a-button size="small" @click="exportStudents" :disabled="students.length === 0">导出</a-button>
                <a-popconfirm title="确定清空所有学生吗?" @confirm="clearAll" ok-text="确定" cancel-text="取消">
                  <a-button type="text" danger size="small" :disabled="students.length === 0">清空</a-button>
                </a-popconfirm>
              </a-space>
            </template>
            <a-row :gutter="[8, 8]" class="stats-row">
              <a-col :span="8">
                <a-statistic title="学生总数" :value="students.length" />
              </a-col>
              <a-col :span="8">
                <a-statistic title="抽取次数" :value="history.length" />
              </a-col>
              <a-col :span="8">
                <a-button size="small" @click="showHistory = true">历史</a-button>
              </a-col>
            </a-row>
            <a-form layout="inline" class="add-form">
              <a-form-item>
                <a-input v-model:value="newStudentName" placeholder="输入姓名" @keyup.enter="addStudentHandler" style="width: 200px" />
              </a-form-item>
              <a-form-item>
                <a-button type="primary" @click="addStudentHandler">添加</a-button>
              </a-form-item>
            </a-form>
            <a-table :dataSource="students" :columns="studentColumns" row-key="id" size="small" :pagination="{ pageSize: 10 }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'actions'">
                  <a-space>
                    <a-button size="small" @click="openWeightEdit(record)">权重</a-button>
                    <a-popconfirm title="确定删除吗?" @confirm="deleteStudentHandler(record.id)" ok-text="确定" cancel-text="取消">
                      <a-button type="text" danger size="small">删除</a-button>
                    </a-popconfirm>
                  </a-space>
                </template>
              </template>
            </a-table>
          </a-card>
        </div>
      </a-layout-content>
    </a-layout>

    <a-modal v-model:open="showSettings" title="设置" @ok="handleSaveSettings" ok-text="确定">
      <a-form layout="vertical">
        <a-form-item label="自动持续时间 (毫秒)">
          <a-input-number v-model:value="autoDuration" :min="1000" :max="60000" :step="1000" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="showImport" title="导入学生" @ok="importStudents" ok-text="确定">
      <a-textarea v-model:value="importText" placeholder="每行一个学生，格式：姓名,权重（可选）" :rows="10" />
    </a-modal>

    <a-modal v-model:open="showWeightEdit" title="编辑权重" @ok="updateWeight" ok-text="确定">
      <a-form layout="vertical">
        <a-form-item label="权重">
          <a-input-number v-model:value="editWeight" :min="1" :max="100" />
        </a-form-item>
      </a-form>
    </a-modal>

    <a-modal v-model:open="showHistory" title="历史记录" :footer="null">
      <a-timeline>
        <a-timeline-item v-for="item in history" :key="item.id">
          <p>{{ item.student_name }}</p>
          <p class="history-time">{{ item.selected_at }}</p>
        </a-timeline-item>
      </a-timeline>
      <a-empty v-if="history.length === 0" description="暂无数据" />
      <a-divider />
      <a-popconfirm title="确定清空历史吗?" @confirm="resetHistoryHandler" ok-text="确定" cancel-text="取消">
        <a-button type="text" danger>清空历史</a-button>
      </a-popconfirm>
    </a-modal>
  </div>
</template>

<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { initDatabase, getAllStudents, getHistory, getSetting, setSetting, addStudent, updateStudentWeight, deleteStudent, clearAllStudents, importFromText, weightedRandomSelect, addHistoryRecord, resetHistory } from './db';

export default {
  name: 'App',
  data() {
    return {
      students: [] as any[],
      history: [] as any[],
      selectedStudent: null as any,
      isSelecting: false,
      isAutoSelecting: false,
      showSettings: false,
      showImport: false,
      showWeightEdit: false,
      showHistory: false,
      showFloating: false,
      showMainInterface: true,
      newStudentName: '',
      importText: '',
      editWeight: 1,
      editStudentId: null as number | null,
      autoDuration: 5000,
      intervalId: null as number | null,
      stopTimeoutId: null as number | null,
      animationFrame: null as number | null,
      isAnimating: false,
      studentColumns: [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
        { title: '姓名', dataIndex: 'name', key: 'name' },
        { title: '权重', dataIndex: 'weight', key: 'weight', width: 80 },
        { title: '次数', dataIndex: 'selected_count', key: 'selected_count', width: 100 },
        { title: '操作', key: 'actions', width: 150 },
      ],
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
    async saveSettings() {
      await setSetting('autoDuration', this.autoDuration.toString());
    },
    async addStudentHandler() {
      if (!this.newStudentName.trim()) return;
      await addStudent(this.newStudentName.trim(), 1);
      this.newStudentName = '';
      await this.loadStudents();
    },
    async updateWeight() {
      if (this.editStudentId === null) return;
      await updateStudentWeight(this.editStudentId, this.editWeight);
      this.showWeightEdit = false;
      this.editStudentId = null;
      await this.loadStudents();
    },
    async deleteStudentHandler(id: number) {
      await deleteStudent(id);
      await this.loadStudents();
    },
    async clearAll() {
      await clearAllStudents();
      await this.loadStudents();
      await this.loadHistory();
    },
    async importStudents() {
      if (!this.importText.trim()) return;
      await importFromText(this.importText);
      this.importText = '';
      this.showImport = false;
      await this.loadStudents();
    },
    exportStudents() {
      const lines = this.students.map((s: any) => `${s.name},${s.weight}`).join('\n');
      const blob = new Blob([lines], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'students.txt';
      a.click();
      URL.revokeObjectURL(url);
    },
    async resetHistoryHandler() {
      await resetHistory();
      await this.loadStudents();
      await this.loadHistory();
    },
    openWeightEdit(student: any) {
      this.editStudentId = student.id;
      this.editWeight = student.weight;
      this.showWeightEdit = true;
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
    async handleSaveSettings() {
      await this.saveSettings();
      this.showSettings = false;
    },
  },
};
</script>

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