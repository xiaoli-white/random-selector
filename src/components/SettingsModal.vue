<script lang="ts">
import { message } from 'ant-design-vue';
import { 
  getAllItems, getHistory, getSetting, setSetting, 
  addItem, updateItemWeight, updateItemName, updateItemDisabled, deleteItem, 
  importFromText, resetHistory, hasPassword, verifyPassword, setPassword,
  getCustomTexts, saveCustomTexts
} from '../db';

export default {
  name: 'SettingsModal',
  props: {
    open: Boolean
  },
  emits: ['update:open', 'refresh'],
  data() {
    return {
      items: [] as any[],
      history: [] as any[],
      originalItems: [] as any[],
      originalHistory: [] as any[],
      autoDuration: 3000,
      originalAutoDuration: 3000,
      settingsTab: 'items',
      showImport: false,
      newItemName: '',
      importText: '',
      editWeight: 1,
      editName: '',
      editingNameKey: null as number | null,
      editingWeightKey: null as number | null,
      pendingAdds: [] as any[],
      pendingDeletes: [] as number[],
      pendingEdits: [] as any[],
      pendingHistoryClear: false,
      itemColumns: [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Weight', dataIndex: 'weight', key: 'weight', width: 80 },
        { title: 'Status', dataIndex: 'disabled', key: 'disabled', width: 80 },
        { title: 'Actions', key: 'actions', width: 100 },
        { title: 'Select', dataIndex: 'selected', key: 'selected', width: 60 },
      ],
      statsColumns: [
        { title: 'Rank', dataIndex: 'rank', key: 'rank', width: 60 },
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60 },
        { title: 'Name', dataIndex: 'name', key: 'name' },
        { title: 'Selected Count', dataIndex: 'selected_count', key: 'selected_count', width: 120 },
      ],
      selectedItemIds: [] as number[],
      batchWeight: 1,
      isDirty: false,
      showPasswordModal: false,
      passwordInput: '',
      passwordError: '',
      hasPassword: false,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      showPasswordSettings: false,
      pendingPasswordChange: false,
      pendingRemovePassword: false,
      customTexts: {} as Record<string, string>,
      originalCustomTexts: {} as Record<string, string>,
      customTextFields: [
        { key: 'windowTitle', label: 'Window Title (System Title Bar)', fallback: 'Random Selector' },
        { key: 'appTitle', label: 'App Title (Main Display)', fallback: 'Random Selector' },
        { key: 'btnStart', label: 'Start Button', fallback: 'Start' },
        { key: 'btnStop', label: 'Stop Button', fallback: 'Stop' },
        { key: 'btnAuto', label: 'Auto Button', fallback: 'Auto' },
        { key: 'btnShowFloat', label: 'Show Float Button', fallback: 'Show Float' },
        { key: 'btnHideFloat', label: 'Hide Float Button', fallback: 'Hide Float' },
        { key: 'btnShowMain', label: 'Show Main Button', fallback: 'Show Main' },
        { key: 'btnHideMain', label: 'Hide Main Button', fallback: 'Hide Main' },
        { key: 'trayShowMain', label: 'Tray Menu - Show Main', fallback: 'Show Main' },
        { key: 'trayHideMain', label: 'Tray Menu - Hide Main', fallback: 'Hide Main' },
        { key: 'trayQuit', label: 'Tray Menu - Quit', fallback: 'Quit' },
        { key: 'hintText', label: 'Hint Text', fallback: 'Click "Start" button' },
        { key: 'errorNoActiveItems', label: 'No Active Items Error', fallback: 'No active items available' },
        { key: 'errorRecordFailed', label: 'Record Failed Error', fallback: 'Failed to record selection' },
        { key: 'errorFloatingWindow', label: 'Floating Window Error', fallback: 'Failed to toggle floating window' },
        { key: 'errorToggleWindow', label: 'Toggle Window Error', fallback: 'Failed to toggle main window' },
      ] as any[],
    };
  },
  computed: {
    visible: {
      get() { return this.open; },
      set(val: boolean) { this.$emit('update:open', val); }
    },
    sortedStats() {
      return [...this.items]
        .sort((a, b) => b.selected_count - a.selected_count)
        .map((s, i) => ({ ...s, rank: i + 1 }));
    },
    passwordStatusText() {
      if (this.pendingRemovePassword) return 'Password Status: Pending Removal';
      if (this.pendingPasswordChange) return 'Password Status: Pending Change';
      return this.hasPassword ? 'Password Status: Set' : 'Password Status: Not Set';
    },
    passwordModalTitle() {
      if (this.pendingPasswordChange) return 'Change Password';
      return this.hasPassword ? 'Change Password' : 'Set Password';
    }
  },
  watch: {
    open(val) {
      if (val) {
        this.loadData(false);
      }
    }
  },
  methods: {
    async loadData(skipPassword: boolean) {
      this.items = await getAllItems();
      this.history = await getHistory(50);
      const duration = await getSetting('autoDuration');
      if (duration) this.autoDuration = parseInt(duration) || 3000;
      
      this.originalItems = JSON.parse(JSON.stringify(this.items));
      this.originalHistory = JSON.parse(JSON.stringify(this.history));
      this.originalAutoDuration = this.autoDuration;
      this.pendingAdds = [];
      this.pendingDeletes = [];
      this.pendingEdits = [];
      this.pendingHistoryClear = false;
      this.isDirty = false;
      this.selectedItemIds = [];
      this.batchWeight = 1;
      
      this.hasPassword = await hasPassword();
      const loadedTexts = await getCustomTexts();
      this.customTextFields.forEach(field => {
        if (!loadedTexts[field.key]) {
          loadedTexts[field.key] = field.fallback;
        }
      });
      this.customTexts = loadedTexts;
      this.originalCustomTexts = JSON.parse(JSON.stringify(this.customTexts));
      
      this.pendingPasswordChange = false;
      this.pendingRemovePassword = false;
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      
      if (!skipPassword && this.hasPassword) {
        this.visible = false;
        this.showPasswordModal = true;
        this.passwordInput = '';
        this.passwordError = '';
      }
    },
    async checkPasswordAndOpen(): Promise<boolean> {
      const hasPwd = await hasPassword();
      if (!hasPwd && !this.pendingPasswordChange) return true;
      
      return new Promise((resolve) => {
        this.showPasswordModal = true;
        this.passwordInput = '';
        this.passwordError = '';
        
        const check = async () => {
          const valid = await verifyPassword(this.passwordInput);
          if (valid) {
            this.showPasswordModal = false;
            this.passwordInput = '';
            resolve(true);
          } else {
            this.passwordError = 'Incorrect password';
            resolve(false);
          }
        };
        check();
      });
    },
    async handlePasswordSubmit() {
      const valid = await verifyPassword(this.passwordInput);
      if (valid) {
        this.showPasswordModal = false;
        this.passwordInput = '';
        this.passwordError = '';
        this.loadData(true);
        this.visible = true;
      } else {
        this.passwordError = 'Incorrect password';
      }
    },
    async onTitleClick() {
      const canOpen = await this.checkPasswordAndOpen();
      if (canOpen) {
        this.visible = true;
      }
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
      const hasCustomTextsChange = JSON.stringify(this.customTexts) !== JSON.stringify(this.originalCustomTexts);
      const hasPasswordChange = this.pendingPasswordChange;
      this.isDirty = hasAdds || hasDeletes || hasEdits || hasHistoryClear || hasDurationChange || hasCustomTextsChange || hasPasswordChange;
    },
    async handleAddItem() {
      if (!this.newItemName.trim()) return;
      const tempId = Date.now();
      this.pendingAdds.push({ id: tempId, name: this.newItemName.trim(), weight: 1, selected_count: 0, disabled: 0 });
      this.items.push({ id: tempId, name: this.newItemName.trim(), weight: 1, selected_count: 0, disabled: 0, isNew: true });
      this.newItemName = '';
      this.checkDirty();
    },
    async handleDeleteItem(id: number) {
      const item = this.items.find(i => i.id === id);
      if (item) {
        if ((item as any).isNew) {
          this.pendingAdds = this.pendingAdds.filter(a => a.id !== id);
        } else {
          this.pendingDeletes.push(id);
        }
        this.items = this.items.filter(i => i.id !== id);
        this.checkDirty();
      }
    },
    async handleClearAll() {
      this.pendingDeletes = this.items.filter(i => !(i as any).isNew).map(i => i.id);
      this.pendingAdds = [];
      this.items = [];
      this.checkDirty();
    },
    async handleResetHistory() {
      this.pendingHistoryClear = true;
      this.history = [];
      this.checkDirty();
    },
    selectAllItems() {
      this.selectedItemIds = this.items.map(i => i.id);
    },
    deselectAllItems() {
      this.selectedItemIds = [];
    },
    async batchDeleteItems() {
      if (this.selectedItemIds.length === 0) return;
      for (const id of this.selectedItemIds) {
        await this.handleDeleteItem(id);
      }
      this.selectedItemIds = [];
    },
    async batchUpdateWeight() {
      if (this.selectedItemIds.length === 0) return;
      for (const id of this.selectedItemIds) {
        const item = this.items.find(i => i.id === id);
        if (item) {
          if ((item as any).isNew) {
            const idx = this.items.indexOf(item);
            const updated = { ...item, weight: this.batchWeight };
            this.items.splice(idx, 1, updated);
            const pending = this.pendingAdds.find(p => p.id === id);
            if (pending) pending.weight = this.batchWeight;
          } else {
            const existingEdit = this.pendingEdits.find(e => e.id === id);
            if (existingEdit) {
              existingEdit.weight = this.batchWeight;
            } else {
              this.pendingEdits.push({ id, weight: this.batchWeight });
            }
            const idx = this.items.indexOf(item);
            const updated = { ...item, weight: this.batchWeight };
            this.items.splice(idx, 1, updated);
          }
        }
      }
      this.checkDirty();
      message.success(`Updated weight for ${this.selectedItemIds.length} items to ${this.batchWeight}`);
    },
    async batchToggleDisable() {
      if (this.selectedItemIds.length === 0) return;
      for (const id of this.selectedItemIds) {
        const item = this.items.find(i => i.id === id);
        if (item) {
          const newDisabled = item.disabled ? 0 : 1;
          if ((item as any).isNew) {
            const idx = this.items.indexOf(item);
            const updated = { ...item, disabled: newDisabled };
            this.items.splice(idx, 1, updated);
            const pending = this.pendingAdds.find(p => p.id === id);
            if (pending) pending.disabled = newDisabled;
          } else {
            const existingEdit = this.pendingEdits.find(e => e.id === id);
            if (existingEdit) {
              existingEdit.disabled = newDisabled;
            } else {
              this.pendingEdits.push({ id, disabled: newDisabled });
            }
            const idx = this.items.indexOf(item);
            const updated = { ...item, disabled: newDisabled };
            this.items.splice(idx, 1, updated);
          }
        }
      }
      this.checkDirty();
      const action = this.selectedItemIds.some(id => {
        const item = this.items.find(i => i.id === id);
        return item && item.disabled;
      }) ? 'enabled' : 'disabled';
      message.success(`${this.selectedItemIds.length} items ${action}`);
    },
    isSelected(id: number): boolean {
      return this.selectedItemIds.includes(id);
    },
    toggleSelection(id: number) {
      const idx = this.selectedItemIds.indexOf(id);
      if (idx === -1) {
        this.selectedItemIds.push(id);
      } else {
        this.selectedItemIds.splice(idx, 1);
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
          message.warning(`Imported ${result.count}, partial failed: ${result.errors.join(', ')}`);
        } else {
          message.success(`Successfully imported ${result.count} items`);
        }
        this.importText = '';
        this.showImport = false;
        await this.loadData(true);
      };
      reader.readAsText(file);
      return false;
    },
    async importItems() {
      if (!this.importText.trim()) return;
      const lines = this.importText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let count = 0;
      
      for (const line of lines) {
        const parts = line.split(/[,\t]/);
        const name = parts[0].trim();
        const weight = parts.length > 1 ? parseInt(parts[1]) || 1 : 1;
        
        if (!name) continue;
        
        const exists = this.items.some(i => i.name === name) || this.pendingAdds.some(a => a.name === name);
        if (exists) continue;
        
        const tempId = Date.now() + count;
        this.pendingAdds.push({ id: tempId, name, weight, selected_count: 0, disabled: 0 });
        this.items.push({ id: tempId, name, weight, selected_count: 0, disabled: 0, isNew: true });
        count++;
      }
      
      this.importText = '';
      this.showImport = false;
      this.checkDirty();
      message.success(`Added ${count} items to pending list`);
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
          message.error('Name cannot be empty');
          return;
        }
        const item = this.items.find(i => i.id === this.editingNameKey);
        if (item && !(item as any).isNew) {
          this.pendingEdits.push({ id: this.editingNameKey, name: this.editName.trim() });
        } else if (item) {
          const idx = this.items.indexOf(item);
          this.items.splice(idx, 1, { ...item, name: this.editName.trim() });
        }
      }
      if (this.editingWeightKey !== null) {
        const item = this.items.find(i => i.id === this.editingWeightKey);
        if (item && !(item as any).isNew) {
          this.pendingEdits.push({ id: this.editingWeightKey, weight: this.editWeight });
        } else if (item) {
          const idx = this.items.indexOf(item);
          this.items.splice(idx, 1, { ...item, weight: this.editWeight });
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
      const hasPwd = await hasPassword();
      if (hasPwd || this.pendingPasswordChange) {
        const canSave = await this.checkPasswordAndOpen();
        if (!canSave) {
          message.error('Password verification failed');
          return;
        }
      }
      
      if (this.pendingPasswordChange) {
        if (this.pendingRemovePassword) {
          await setSetting('admin_password_hash', '');
          this.hasPassword = false;
        } else {
          await setPassword(this.newPassword);
          this.hasPassword = true;
        }
        this.pendingPasswordChange = false;
        this.pendingRemovePassword = false;
      }
      
      if (this.pendingHistoryClear) {
        await resetHistory();
      }
      
      for (const id of this.pendingDeletes) {
        await deleteItem(id);
      }
      
      for (const item of this.pendingAdds) {
        await addItem(item.name, item.weight);
        if (item.disabled) {
          const dbItems = await getAllItems();
          const dbItem = dbItems.find(i => i.name === item.name);
          if (dbItem) {
            await updateItemDisabled(dbItem.id!, item.disabled);
          }
        }
      }
      
      for (const edit of this.pendingEdits) {
        if (edit.name !== undefined) {
          await updateItemName(edit.id, edit.name);
        }
        if (edit.weight !== undefined) {
          await updateItemWeight(edit.id, edit.weight);
        }
        if (edit.disabled !== undefined) {
          await updateItemDisabled(edit.id, edit.disabled);
        }
      }
      
      await setSetting('autoDuration', this.autoDuration.toString());
      await saveCustomTexts(this.customTexts);
      
      await this.loadData(true);
      this.$emit('refresh');
      message.success('Saved successfully');
    },
    openPasswordSettings() {
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.pendingPasswordChange = false;
      this.pendingRemovePassword = false;
      this.showPasswordSettings = true;
    },
    async handleChangePassword() {
      if (!this.newPassword) {
        message.error('Please enter a new password');
        return;
      }
      if (this.newPassword !== this.confirmPassword) {
        message.error('Passwords do not match');
        return;
      }
      if (this.hasPassword) {
        const valid = await verifyPassword(this.currentPassword);
        if (!valid) {
          message.error('Current password is incorrect');
          return;
        }
      }
      this.pendingPasswordChange = true;
      this.currentPassword = '';
      this.newPassword = '';
      this.confirmPassword = '';
      this.showPasswordSettings = false;
      this.checkDirty();
      message.success('Password change pending, click Save to apply');
    },
    async handleRemovePassword() {
      this.pendingPasswordChange = true;
      this.pendingRemovePassword = true;
      this.checkDirty();
      message.success('Password removal pending, click Save to apply');
    },
    cancelRemovePassword() {
      this.pendingPasswordChange = false;
      this.pendingRemovePassword = false;
      this.checkDirty();
      message.info('Password removal cancelled');
    },
    getLocalTime(utcString: string): string {
      if (!utcString) return '';
      try {
        const date = new Date(utcString + ' UTC');
        return date.toLocaleString();
      } catch {
        return utcString;
      }
    },
    updateCustomText(key: string, value: string) {
      this.customTexts[key] = value;
      this.checkDirty();
    },
    updateItemDisabled(id: number, disabled: number) {
      const item = this.items.find(i => i.id === id);
      if (item) {
        if ((item as any).isNew) {
          const idx = this.items.indexOf(item);
          const updated = { ...item, disabled };
          this.items.splice(idx, 1, updated);
          const pending = this.pendingAdds.find(p => p.id === id);
          if (pending) pending.disabled = disabled;
        } else {
          const existingEdit = this.pendingEdits.find(e => e.id === id);
          if (existingEdit) {
            existingEdit.disabled = disabled;
          } else {
            this.pendingEdits.push({ id, disabled });
          }
          const idx = this.items.indexOf(item);
          const updated = { ...item, disabled };
          this.items.splice(idx, 1, updated);
        }
        this.checkDirty();
      }
    },
  },
  beforeUnmount() {}
};
</script>

<template>
  <a-modal v-model:open="visible" title="Admin Panel" width="900px" :footer="null">
    <a-tabs v-model:activeKey="settingsTab">
      <a-tab-pane key="general" tab="General">
        <a-form layout="vertical">
          <a-form-item label="Auto Duration (ms)">
            <a-input-number v-model:value="autoDuration" :min="1000" :max="60000" :step="500" style="width: 100%" />
          </a-form-item>
        </a-form>
      </a-tab-pane>
      <a-tab-pane key="items" tab="Items">
        <a-space class="mb-3">
          <a-button @click="showImportModal">Import</a-button>
          <a-popconfirm title="Clear all items?" @confirm="handleClearAll" ok-text="Yes" cancel-text="No">
            <a-button danger :disabled="items.length === 0">Clear All</a-button>
          </a-popconfirm>
          <a-button @click="selectAllItems">Select All</a-button>
          <a-button @click="deselectAllItems">Deselect All</a-button>
          <a-popconfirm title="Delete selected items?" @confirm="batchDeleteItems" ok-text="Yes" cancel-text="No">
            <a-button danger :disabled="selectedItemIds.length === 0">Delete ({{ selectedItemIds.length }})</a-button>
          </a-popconfirm>
          <a-button @click="batchToggleDisable" :disabled="selectedItemIds.length === 0">
            Toggle Disable
          </a-button>
          <a-space>
            <a-button :disabled="selectedItemIds.length === 0" @click="batchUpdateWeight">Set Weight</a-button>
            <a-input-number v-model:value="batchWeight" :min="1" :max="100" size="small" style="width: 60px" />
          </a-space>
        </a-space>
        <a-form layout="inline" class="mb-3">
          <a-form-item>
            <a-input v-model:value="newItemName" placeholder="Name" @keyup.enter="handleAddItem" style="width: 200px" />
          </a-form-item>
          <a-form-item>
            <a-button type="primary" @click="handleAddItem">Add</a-button>
          </a-form-item>
        </a-form>
        <a-table :dataSource="items" :columns="itemColumns" row-key="id" size="small" :pagination="{ pageSize: 10 }">
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
            <template v-else-if="column.key === 'disabled'">
              <a-tag :color="record.disabled ? 'red' : 'green'">
                {{ record.disabled ? 'Disabled' : 'Active' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button type="text" size="small" @click="updateItemDisabled(record.id, record.disabled ? 0 : 1)">
                {{ record.disabled ? 'Enable' : 'Disable' }}
              </a-button>
              <a-popconfirm title="Delete?" @confirm="handleDeleteItem(record.id)" ok-text="Yes" cancel-text="No">
                <a-button type="text" danger size="small">Delete</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </a-tab-pane>
      <a-tab-pane key="history" tab="History">
        <a-timeline>
          <a-timeline-item v-for="item in history" :key="item.id">
            <span class="history-time">{{ getLocalTime(item.selected_at) }}</span>
            <span>{{ item.student_name }}</span>
          </a-timeline-item>
        </a-timeline>
        <a-empty v-if="history.length === 0" description="No data" />
        <a-divider />
        <a-popconfirm title="Clear history?" @confirm="handleResetHistory" ok-text="Yes" cancel-text="No">
          <a-button danger>Clear History</a-button>
        </a-popconfirm>
      </a-tab-pane>
      <a-tab-pane key="stats" tab="Statistics">
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
      <a-tab-pane key="security" tab="Security">
        <a-form layout="vertical">
          <a-form-item :label="passwordStatusText">
            <a-space>
              <a-button type="primary" @click="openPasswordSettings">
                {{ hasPassword ? 'Change Password' : 'Set Password' }}
              </a-button>
              <a-button v-if="hasPassword && !pendingRemovePassword" danger @click="handleRemovePassword">Remove Password</a-button>
              <a-button v-if="pendingRemovePassword" danger @click="cancelRemovePassword">Cancel Remove</a-button>
            </a-space>
          </a-form-item>
        </a-form>
        <a-modal v-model:open="showPasswordSettings" :title="passwordModalTitle" @ok="handleChangePassword" ok-text="OK" cancel-text="Cancel">
          <a-form layout="vertical">
            <a-form-item v-if="hasPassword && !pendingPasswordChange" label="Current Password">
              <a-input-password v-model:value="currentPassword" placeholder="Enter current password" />
            </a-form-item>
            <a-form-item label="New Password">
              <a-input-password v-model:value="newPassword" placeholder="Enter new password" />
            </a-form-item>
            <a-form-item label="Confirm Password">
              <a-input-password v-model:value="confirmPassword" placeholder="Confirm new password" />
            </a-form-item>
          </a-form>
        </a-modal>
      </a-tab-pane>
      <a-tab-pane key="customtexts" tab="Custom">
        <a-form layout="vertical">
          <a-form-item v-for="field in customTextFields" :key="field.key" :label="field.label">
            <a-input 
              v-model:value="customTexts[field.key]" 
              :placeholder="field.fallback"
              @change="updateCustomText(field.key, customTexts[field.key])"
            />
          </a-form-item>
        </a-form>
      </a-tab-pane>
    </a-tabs>
    <a-divider style="margin: 8px 0;" />
    <div style="text-align: center;">
      <a-space>
        <a-button @click="handleCancel">Cancel</a-button>
        <a-button type="primary" @click="handleSave" :disabled="!isDirty">Save</a-button>
      </a-space>
    </div>
  </a-modal>

  <a-modal v-model:open="showPasswordModal" title="Enter Password" @ok="handlePasswordSubmit" ok-text="OK" cancel-text="Cancel">
    <a-form layout="vertical">
      <a-form-item label="Password">
        <a-input-password v-model:value="passwordInput" placeholder="Enter password" @keyup.enter="handlePasswordSubmit" />
      </a-form-item>
      <a-alert v-if="passwordError" type="error" :message="passwordError" />
    </a-form>
  </a-modal>

  <a-modal v-model:open="showImport" title="Import Items" @ok="importItems" ok-text="OK">
    <a-space direction="vertical" style="width: 100%">
      <a-textarea v-model:value="importText" placeholder="One per line, format: name,weight (optional)" :rows="10" />
      <a-divider>Or</a-divider>
      <a-upload :before-upload="handleFileUpload" :show-upload-list="false" accept=".txt,.csv">
        <a-button>
          Import from File
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