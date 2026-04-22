<script lang="ts">
import { message } from 'ant-design-vue';
import { getAllStudents, getHistory, getSetting, setSetting, addStudent, updateStudentWeight, updateStudentName, deleteStudent, importFromText, resetHistory } from '../db';

export default {
  name: 'SettingsModal',
  props: {
    open: Boolean
  },
  emits: ['update:open', 'refresh'],
  data() {
    return {
      students: [] as any[],
      history: [] as any[],
      originalStudents: [] as any[],
      originalHistory: [] as any[],
      autoDuration: 5000,
      originalAutoDuration: 5000,
      settingsTab: 'students',
      showImport: false,
      newStudentName: '',
      importText: '',
      editWeight: 1,
      editName: '',
      editingNameKey: null as number | null,
      editingWeightKey: null as number | null,
      pendingAdds: [] as any[],
      pendingDeletes: [] as number[],
      pendingEdits: [] as any[],
      pendingHistoryClear: false,
      studentColumns: [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
        { title: '姓名', dataIndex: 'name', key: 'name' },
        { title: '权重', dataIndex: 'weight', key: 'weight', width: 80 },
        { title: '操作', key: 'actions', width: 80 },
        { title: '选择', dataIndex: 'selected', key: 'selected', width: 60 },
      ],
      statsColumns: [
        { title: '排名', dataIndex: 'rank', key: 'rank', width: 60 },
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
        { title: '姓名', dataIndex: 'name', key: 'name' },
        { title: '被抽中次数', dataIndex: 'selected_count', key: 'selected_count', width: 120 },
      ],
      selectedStudentIds: [] as number[],
      batchWeight: 1,
      isDirty: false,
    };
  },
  computed: {
    visible: {
      get() { return this.open; },
      set(val: boolean) { this.$emit('update:open', val); }
    },
    sortedStats() {
      return [...this.students]
        .sort((a, b) => b.selected_count - a.selected_count)
        .map((s, i) => ({ ...s, rank: i + 1 }));
    }
  },
  watch: {
    open(val) {
      if (val) {
        this.loadData();
      }
    }
  },
  methods: {
    async loadData() {
      this.students = await getAllStudents();
      this.history = await getHistory(50);
      const duration = await getSetting('autoDuration');
      if (duration) this.autoDuration = parseInt(duration) || 5000;
      
      this.originalStudents = JSON.parse(JSON.stringify(this.students));
      this.originalHistory = JSON.parse(JSON.stringify(this.history));
      this.originalAutoDuration = this.autoDuration;
      this.pendingAdds = [];
      this.pendingDeletes = [];
      this.pendingEdits = [];
      this.pendingHistoryClear = false;
      this.isDirty = false;
      this.selectedStudentIds = [];
      this.batchWeight = 1;
    },
    handleClose() {
      this.visible = false;
      this.$emit('refresh');
    },
    handleCancel() {
      this.visible = false;
    },
    checkDirty() {
      const hasAdds = this.pendingAdds.length > 0;
      const hasDeletes = this.pendingDeletes.length > 0;
      const hasEdits = this.pendingEdits.length > 0;
      const hasHistoryClear = this.pendingHistoryClear;
      const hasDurationChange = this.autoDuration !== this.originalAutoDuration;
      this.isDirty = hasAdds || hasDeletes || hasEdits || hasHistoryClear || hasDurationChange;
    },
    async handleAddStudent() {
      if (!this.newStudentName.trim()) return;
      const tempId = Date.now();
      this.pendingAdds.push({ id: tempId, name: this.newStudentName.trim(), weight: 1, selected_count: 0 });
      this.students.push({ id: tempId, name: this.newStudentName.trim(), weight: 1, selected_count: 0, isNew: true });
      this.newStudentName = '';
      this.checkDirty();
    },
    async handleDeleteStudent(id: number) {
      const student = this.students.find(s => s.id === id);
      if (student) {
        if ((student as any).isNew) {
          this.pendingAdds = this.pendingAdds.filter(a => a.id !== id);
        } else {
          this.pendingDeletes.push(id);
        }
        this.students = this.students.filter(s => s.id !== id);
        this.checkDirty();
      }
    },
    async handleClearAll() {
      this.pendingDeletes = this.students.filter(s => !(s as any).isNew).map(s => s.id);
      this.pendingAdds = [];
      this.students = [];
      this.checkDirty();
    },
    async handleResetHistory() {
      this.pendingHistoryClear = true;
      this.history = [];
      this.checkDirty();
    },
    selectAllStudents() {
      this.selectedStudentIds = this.students.map(s => s.id);
    },
    deselectAllStudents() {
      this.selectedStudentIds = [];
    },
    async batchDeleteStudents() {
      if (this.selectedStudentIds.length === 0) return;
      for (const id of this.selectedStudentIds) {
        await this.handleDeleteStudent(id);
      }
      this.selectedStudentIds = [];
    },
    async batchUpdateWeight() {
      if (this.selectedStudentIds.length === 0) return;
      for (const id of this.selectedStudentIds) {
        const student = this.students.find(s => s.id === id);
        if (student) {
          if ((student as any).isNew) {
            const idx = this.students.indexOf(student);
            const updated = { ...student, weight: this.batchWeight };
            this.students.splice(idx, 1, updated);
            const pending = this.pendingAdds.find(p => p.id === id);
            if (pending) pending.weight = this.batchWeight;
          } else {
            const existingEdit = this.pendingEdits.find(e => e.id === id);
            if (existingEdit) {
              existingEdit.weight = this.batchWeight;
            } else {
              this.pendingEdits.push({ id, weight: this.batchWeight });
            }
            const idx = this.students.indexOf(student);
            const updated = { ...student, weight: this.batchWeight };
            this.students.splice(idx, 1, updated);
          }
        }
      }
      this.checkDirty();
      message.success(`已将 ${this.selectedStudentIds.length} 个学生的权重修改为 ${this.batchWeight}，点击保存生效`);
    },
    isSelected(id: number): boolean {
      return this.selectedStudentIds.includes(id);
    },
    toggleSelection(id: number) {
      const idx = this.selectedStudentIds.indexOf(id);
      if (idx === -1) {
        this.selectedStudentIds.push(id);
      } else {
        this.selectedStudentIds.splice(idx, 1);
      }
    },
    showImportModal() {
      this.showImport = true;
    },
    async handleFileUpload(file: File) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const result = await importFromText(text);
        if (result.errors.length > 0) {
          message.warning(`导入 ${result.count} 个，部分失败: ${result.errors.join(', ')}`);
        } else {
          message.success(`成功导入 ${result.count} 个学生`);
        }
        this.importText = '';
        this.showImport = false;
        await this.loadData();
      };
      reader.readAsText(file);
      return false;
    },
    async importStudents() {
      if (!this.importText.trim()) return;
      const lines = this.importText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let count = 0;
      
      for (const line of lines) {
        const parts = line.split(/[,\t]/);
        const name = parts[0].trim();
        const weight = parts.length > 1 ? parseInt(parts[1]) || 1 : 1;
        
        if (!name) continue;
        
        const exists = this.students.some(s => s.name === name) || this.pendingAdds.some(a => a.name === name);
        if (exists) continue;
        
        const tempId = Date.now() + count;
        this.pendingAdds.push({ id: tempId, name, weight, selected_count: 0 });
        this.students.push({ id: tempId, name, weight, selected_count: 0, isNew: true });
        count++;
      }
      
      this.importText = '';
      this.showImport = false;
      this.checkDirty();
      message.success(`已添加 ${count} 个学生到待保存列表`);
    },
    startEditName(record: any) {
      this.editingNameKey = record.id;
      this.editName = record.name;
    },
    startEditWeight(record: any) {
      this.editingWeightKey = record.id;
      this.editWeight = record.weight;
    },
    async saveAllEdits() {
      if (this.editingNameKey !== null) {
        if (!this.editName.trim()) {
          message.error('姓名不能为空');
          return;
        }
        const student = this.students.find(s => s.id === this.editingNameKey);
        if (student && !(student as any).isNew) {
          this.pendingEdits.push({ id: this.editingNameKey, name: this.editName.trim() });
        } else if (student) {
          const idx = this.students.indexOf(student);
          this.students.splice(idx, 1, { ...student, name: this.editName.trim() });
        }
      }
      if (this.editingWeightKey !== null) {
        const student = this.students.find(s => s.id === this.editingWeightKey);
        if (student && !(student as any).isNew) {
          this.pendingEdits.push({ id: this.editingWeightKey, weight: this.editWeight });
        } else if (student) {
          const idx = this.students.indexOf(student);
          this.students.splice(idx, 1, { ...student, weight: this.editWeight });
        }
      }
      this.editingNameKey = null;
      this.editingWeightKey = null;
      this.checkDirty();
    },
    cancelEdits() {
      this.editingNameKey = null;
      this.editingWeightKey = null;
    },
    onEditBlur() {
      setTimeout(() => {
        const activeEl = document.activeElement;
        if (!activeEl || !activeEl.closest('.ant-table')) {
          this.saveAllEdits();
        }
      }, 150);
    },
    async handleSave() {
      if (this.pendingHistoryClear) {
        await resetHistory();
      }
      
      for (const id of this.pendingDeletes) {
        await deleteStudent(id);
      }
      
      for (const student of this.pendingAdds) {
        await addStudent(student.name, student.weight);
      }
      
      for (const edit of this.pendingEdits) {
        if (edit.name !== undefined) {
          await updateStudentName(edit.id, edit.name);
        }
        if (edit.weight !== undefined) {
          await updateStudentWeight(edit.id, edit.weight);
        }
      }
      
      await setSetting('autoDuration', this.autoDuration.toString());
      
      await this.loadData();
      this.$emit('refresh');
      message.success('保存成功');
    }
  },
  beforeUnmount() {}
};
</script>

<template>
  <a-modal v-model:open="visible" title="管理面板" width="800px" @cancel="handleClose">
    <template #footer>
      <div style="text-align: center;">
        <a-space>
          <a-button @click="handleCancel">取消</a-button>
          <a-button type="primary" @click="handleSave">保存</a-button>
        </a-space>
      </div>
    </template>
    <a-tabs v-model:activeKey="settingsTab">
      <a-tab-pane key="general" tab="常规">
        <a-form layout="vertical">
          <a-form-item label="自动抽取持续时间 (毫秒)">
            <a-input-number v-model:value="autoDuration" :min="1000" :max="60000" :step="1000" />
          </a-form-item>
        </a-form>
      </a-tab-pane>
      <a-tab-pane key="students" tab="学生名单">
        <a-space class="mb-3">
          <a-button @click="selectAllStudents">全选</a-button>
          <a-button @click="deselectAllStudents">取消全选</a-button>
          <a-popconfirm title="确定删除选中的学生吗?" @confirm="batchDeleteStudents" ok-text="确定" cancel-text="取消">
            <a-button danger :disabled="selectedStudentIds.length === 0">删除选中 ({{ selectedStudentIds.length }})</a-button>
          </a-popconfirm>
          <a-space>
            <a-button :disabled="selectedStudentIds.length === 0" @click="batchUpdateWeight">修改选中权重为</a-button>
            <a-input-number v-model:value="batchWeight" :min="1" :max="100" size="small" style="width: 60px" />
          </a-space>
          <a-button @click="showImportModal">导入</a-button>
          <a-popconfirm title="确定清空所有学生吗?" @confirm="handleClearAll" ok-text="确定" cancel-text="取消">
            <a-button danger :disabled="students.length === 0">清空</a-button>
          </a-popconfirm>
        </a-space>
        <a-form layout="inline" class="mb-3">
          <a-form-item>
            <a-input v-model:value="newStudentName" placeholder="输入姓名" @keyup.enter="handleAddStudent" style="width: 200px" />
          </a-form-item>
          <a-form-item>
            <a-button type="primary" @click="handleAddStudent">添加</a-button>
          </a-form-item>
        </a-form>
        <a-table :dataSource="students" :columns="studentColumns" row-key="id" size="small" :pagination="{ pageSize: 10 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'selected'">
              <a-checkbox :checked="isSelected(record.id)" @change="toggleSelection(record.id)" />
            </template>
            <template v-if="column.key === 'name'">
              <a-input 
                v-if="editingNameKey === record.id" 
                v-model:value="editName" 
                size="small" 
                style="width: 120px"
                @blur="onEditBlur"
                @pressEnter="saveAllEdits"
                @dblclick.stop 
              />
              <span v-else @click.stop="startEditName(record)" @dblclick.stop style="cursor: pointer;">{{ record.name }}</span>
            </template>
            <template v-else-if="column.key === 'weight'">
              <a-input-number 
                v-if="editingWeightKey === record.id" 
                v-model:value="editWeight" 
                :min="1" 
                :max="100" 
                size="small" 
                style="width: 60px"
                @blur="onEditBlur"
                @pressEnter="saveAllEdits"
                @dblclick.stop 
              />
              <span v-else @click.stop="startEditWeight(record)" @dblclick.stop style="cursor: pointer;">{{ record.weight }}</span>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-popconfirm title="确定删除吗?" @confirm="handleDeleteStudent(record.id)" ok-text="确定" cancel-text="取消">
                <a-button type="text" danger size="small">删除</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="history" tab="历史记录">
        <a-timeline>
          <a-timeline-item v-for="item in history" :key="item.id">
            <span class="history-time">{{ item.selected_at }}</span>
            <span>{{ item.student_name }}</span>
          </a-timeline-item>
        </a-timeline>
        <a-empty v-if="history.length === 0" description="暂无数据" />
        <a-divider />
        <a-popconfirm title="确定清空历史吗?" @confirm="handleResetHistory" ok-text="确定" cancel-text="取消">
          <a-button danger>清空历史</a-button>
        </a-popconfirm>
      </a-tab-pane>
      <a-tab-pane key="stats" tab="统计">
        <a-table :dataSource="sortedStats" :columns="statsColumns" row-key="id" size="small" :pagination="{ pageSize: 10 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'rank'">
              <span>{{ record.rank }}</span>
            </template>
            <template v-else-if="column.key === 'selected_count'">
              <span>{{ record.selected_count }}</span>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
    </a-tabs>
  </a-modal>

  <a-modal v-model:open="showImport" title="导入学生" @ok="importStudents" ok-text="确定">
    <a-space direction="vertical" style="width: 100%">
      <a-textarea v-model:value="importText" placeholder="每行一个学生，格式：姓名,权重（可选）" :rows="10" />
      <a-divider>或</a-divider>
      <a-upload :before-upload="handleFileUpload" :show-upload-list="false" accept=".txt,.csv">
        <a-button>
          从文件导入
        </a-button>
      </a-upload>
    </a-space>
  </a-modal>
</template>

<style scoped>
.mb-3 {
  margin-bottom: 12px;
}
.history-time {
  font-size: 12px;
  color: #999;
  margin-right: 8px;
}
</style>