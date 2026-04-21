<template>
  <div class="app-container">
    <a-layout class="main-layout">
      <a-layout-header class="header">
        <div class="header-content">
          <h1 class="app-title">随机点名器</h1>
          <div class="header-actions">
            <a-button @click="showSettings = true">设置</a-button>
            <a-button @click="toggleFloating" type="primary">
              {{ showFloating ? '📤' : '📥' }}
            </a-button>
          </div>
        </div>
      </a-layout-header>

      <a-layout-content class="content">
        <div class="main-area">
          <a-card class="result-card" title="抽取结果">
            <div class="result-display">
              <a-typography-title :level="2">
                {{ selectedStudent ? selectedStudent.name : '暂无数据' }}
              </a-typography-title>
              <div v-if="selectedStudent" class="result-info">
                <span>权重: {{ selectedStudent.weight }}</span>
                <span>次数: {{ selectedStudent.selected_count }}</span>
              </div>
            </div>
            <div class="select-actions">
              <a-button v-if="!isSelecting" type="primary" size="large" @click="startManualSelect" :disabled="students.length === 0">
                开始抽取
              </a-button>
              <a-button v-else type="danger" size="large" @click="stopManualSelect">
                停止
              </a-button>
              <a-button v-if="!isAutoSelecting" type="primary" size="large" @click="startAutoSelect" :disabled="students.length === 0">
                自动抽取
              </a-button>
              <a-button v-else type="danger" size="large" @click="stopAutoSelect">
                停止
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

    <div v-if="showFloating" class="floating-window">
      <a-card class="floating-card" title="随机点名器" size="small">
        <div class="floating-result">
          <a-typography-title :level="3">
            {{ selectedStudent ? selectedStudent.name : '暂无数据' }}
          </a-typography-title>
        </div>
        <div class="floating-actions">
          <a-button v-if="!isSelecting" type="primary" size="small" @click="startManualSelect" :disabled="students.length === 0">
            开始
          </a-button>
          <a-button v-else type="danger" size="small" @click="stopManualSelect">
            停止
          </a-button>
          <a-button v-if="!isAutoSelecting" type="primary" size="small" @click="startAutoSelect" :disabled="students.length === 0">
            自动
          </a-button>
          <a-button v-else type="danger" size="small" @click="stopAutoSelect">
            停止
          </a-button>
        </div>
        <template #actions>
          <a-button type="text" size="small" @click="toggleFloating">✕</a-button>
        </template>
      </a-card>
    </div>

    <a-modal v-model:open="showSettings" title="设置" @ok="handleSaveSettings" ok-text="确定">
      <a-form layout="vertical">
        <a-form-item label="自动间隔 (毫秒)">
          <a-input-number v-model:value="autoInterval" :min="1000" :max="60000" :step="1000" />
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
import options from './options';

export default {
  name: 'App',
  mixins: [options],
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
}

.result-card {
  text-align: center;
}

.result-display {
  padding: 40px 0;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
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

.floating-window {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}

.floating-card {
  width: 280px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.floating-result {
  padding: 24px 0;
  text-align: center;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.floating-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.history-time {
  font-size: 12px;
  color: #999;
}
</style>