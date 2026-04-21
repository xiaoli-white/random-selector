import { defineComponent } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { initDatabase, getAllStudents, getHistory, getSetting, setSetting, addStudent, updateStudentWeight, deleteStudent, clearAllStudents, importFromText, weightedRandomSelect, addHistoryRecord, resetHistory } from './db';

export default defineComponent({
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
      autoInterval: 5000,
      intervalId: null as number | null,
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
      const interval = await getSetting('autoInterval');
      if (interval) this.autoInterval = parseInt(interval) || 5000;
    },
    async saveSettings() {
      await setSetting('autoInterval', this.autoInterval.toString());
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
    async selectStudent() {
      if (this.students.length === 0) return null;
      const selected = weightedRandomSelect(this.students);
      if (selected) {
        await addHistoryRecord(selected.id!, selected.name);
        this.selectedStudent = selected;
        await this.loadHistory();
        await this.loadStudents();
      }
      return selected;
    },
    startManualSelect() {
      if (this.students.length === 0) return;
      this.isSelecting = true;
      this.startAnimation();
    },
    stopManualSelect() {
      this.stopAnimation();
      this.selectStudent();
      this.isSelecting = false;
    },
    startAnimation() {
      this.isAnimating = true;
      let i = 0;
      const animate = () => {
        if (!this.isAnimating) return;
        const displayEl = document.querySelector('.result-display .ant-typography');
        if (displayEl && this.students.length > 0) {
          displayEl.textContent = this.students[i % this.students.length].name;
        }
        i++;
        this.animationFrame = requestAnimationFrame(() => setTimeout(animate, 50));
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
      await this.selectStudent();
      this.intervalId = window.setInterval(async () => {
        if (this.isAutoSelecting && this.students.length > 0) {
          await this.selectStudent();
        }
      }, this.autoInterval) as unknown as number;
    },
    stopAutoSelect() {
      this.isAutoSelecting = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
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
});