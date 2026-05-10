<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { message } from 'ant-design-vue';
import {
  getAllItems, getHistory, getSetting, setSetting,
  addItem, updateItemWeight, updateItemName, updateItemDisabled, deleteItem,
  importFromText, resetHistory, hasPassword, verifyPassword, setPassword,
  getCustomTexts, saveCustomTexts, getMainWindowAlwaysOnTop, setMainWindowAlwaysOnTop,
  getAllConfigs, createConfig, deleteConfig, switchConfig, copyConfig, renameConfig,
  getCurrentConfigId, exportConfigs, importConfig, ExportData,
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
      autoDuration: 2000,
      originalAutoDuration: 2000,
      mainWindowAlwaysOnTop: false,
      originalMainWindowAlwaysOnTop: false,
      settingsTab: 'items',
      showImport: false,
      newItemName: '',
      importText: '',
      editWeight: 1.0,
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
      batchWeight: 1.0,
      isDirty: false,
      showPasswordModal: false,
      passwordInput: '',
      passwordError: '',
      passwordCallback: null as ((success: boolean) => void) | null,
      hasPassword: false,
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
      showPasswordSettings: false,
      pendingPasswordChange: false,
      pendingRemovePassword: false,
      pendingNewPassword: '',
      customTexts: {} as Record<string, string>,
      originalCustomTexts: {} as Record<string, string>,
      searchQuery: '',
      itemFilter: 'all' as 'all' | 'active' | 'disabled',
      customTextFields: [
        { key: 'windowTitle', label: 'Window Title (System Title Bar)', fallback: 'Random Selector', section: 'main' },
        { key: 'appTitle', label: 'App Title (Main Interface)', fallback: 'Random Selector', section: 'main' },
        { key: 'showVersion', label: 'Show Version', fallback: 'true', section: 'main', type: 'switch' },
        { key: 'showAuthor', label: 'Show Author', fallback: 'true', section: 'main', type: 'switch' },
        { key: 'authorName', label: 'Author Name', fallback: '', section: 'main' },
        { key: 'btnStart', label: 'Start Button', fallback: 'Start', section: 'main' },
        { key: 'btnStop', label: 'Stop Button', fallback: 'Stop', section: 'main' },
        { key: 'btnAuto', label: 'Auto Button', fallback: 'Auto', section: 'main' },
        { key: 'btnShowFloat', label: 'Show Float Button', fallback: 'Show Float', section: 'main' },
        { key: 'btnHideFloat', label: 'Hide Float Button', fallback: 'Hide Float', section: 'main' },
        { key: 'btnShowMain', label: 'Floating Window - Show Main Button', fallback: 'Show Main', section: 'window' },
        { key: 'btnHideMain', label: 'Floating Window - Hide Main Button', fallback: 'Hide Main', section: 'window' },
        { key: 'trayToggleMain', label: 'Tray Menu - Toggle Main', fallback: 'Toggle Main', section: 'tray' },
        { key: 'trayQuit', label: 'Tray Menu - Quit', fallback: 'Quit', section: 'tray' },
        { key: 'hintText', label: 'Hint Text', fallback: 'Click "Start" button', section: 'other' },
        { key: 'errorNoActiveItems', label: 'No Active Items Error', fallback: 'No active items available', section: 'other' },
        { key: 'errorRecordFailed', label: 'Record Failed Error', fallback: 'Failed to record selection', section: 'other' },
        { key: 'errorFloatingWindow', label: 'Floating Window Error', fallback: 'Failed to toggle floating window', section: 'other' },
        { key: 'errorToggleWindow', label: 'Toggle Window Error', fallback: 'Failed to toggle main window', section: 'other' },
      ] as any[],
      configs: [] as any[],
      originalConfigs: [] as any[],
      currentConfigId: null as number | null,
      pendingConfigCreates: [] as Array<{ name: string, tempId: number }>,
      pendingConfigDeletes: [] as number[],
      pendingConfigRenames: [] as Array<{ id: number, newName: string }>,
      pendingConfigCopies: [] as Array<{ sourceId: number, newName: string, tempId: number }>,
      pendingConfigSwitchId: null as number | null,
      nextTempConfigId: -1,
      showCreateConfigModal: false,
      showCopyConfigModal: false,
      showRenameConfigModal: false,
      newConfigName: '',
      copyConfigName: '',
      renameConfigName: '',
      selectedConfigIdForCopy: null as number | null,
      selectedConfigIdForRename: null as number | null,
      showExportModal: false,
      showConfigImportModal: false,
      exportSelectedConfigIds: [] as number[],
      configImportText: '',
      configImportFileContent: null as string | null,
    };
  },
  computed: {
    visible: {
      get() { return this.open; },
      set(val: boolean) { this.$emit('update:open', val); }
    },
    sortedStats() {
      return [...this.items]
        .filter(item => !(item as any).isNew)
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
    },
    mainInterfaceFields() {
      return this.customTextFields.filter(f => f.section === 'main');
    },
    windowControlFields() {
      return this.customTextFields.filter(f => f.section === 'window');
    },
    trayIconFields() {
      return this.customTextFields.filter(f => f.section === 'tray');
    },
    otherFields() {
      return this.customTextFields.filter(f => f.section === 'other');
    },
    filteredItems() {
      let result = this.items;
      if (this.itemFilter === 'active') {
        result = result.filter(item => !item.disabled);
      } else if (this.itemFilter === 'disabled') {
        result = result.filter(item => item.disabled);
      }
      if (this.searchQuery.trim()) {
        const query = this.searchQuery.toLowerCase();
        result = result.filter(item => item.name.toLowerCase().includes(query));
      }
      return result;
    },
    displayConfigs() {
      let result = this.configs;

      for (const rename of this.pendingConfigRenames) {
        const cfg = result.find(c => c.id === rename.id);
        if (cfg) {
          cfg._pendingNewName = rename.newName;
          cfg._isPendingRename = true;
        }
      }

      for (const create of this.pendingConfigCreates) {
        result.push({ id: create.tempId, name: create.name, is_active: 0, _isPending: true });
      }

      for (const copy of this.pendingConfigCopies) {
        result.push({ id: copy.tempId, name: copy.newName, is_active: 0, _isPending: true });
      }

      for (const cfg of result) {
        cfg._isPendingDelete = this.pendingConfigDeletes.includes(cfg.id);
      }

      return result;
    },
    effectiveConfigId() {
      return this.pendingConfigSwitchId !== null ? this.pendingConfigSwitchId : this.currentConfigId;
    },
  },
  watch: {
    async open(val) {
      if (val) {
        this.loadData();
      }
    }
  },
  methods: {
    async loadData() {
      this.items = await getAllItems();
      this.history = await getHistory(50);
      const duration = await getSetting('autoDuration');
      this.autoDuration = duration ? parseInt(duration) || 2000 : 2000;
      this.mainWindowAlwaysOnTop = await getMainWindowAlwaysOnTop();

      this.originalItems = JSON.parse(JSON.stringify(this.items));
      this.originalHistory = JSON.parse(JSON.stringify(this.history));
      this.originalAutoDuration = this.autoDuration;
      this.originalMainWindowAlwaysOnTop = this.mainWindowAlwaysOnTop;
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

      this.pendingConfigCreates = [];
      this.pendingConfigDeletes = [];
      this.pendingConfigRenames = [];
      this.pendingConfigCopies = [];
      this.pendingConfigSwitchId = null;
      this.nextTempConfigId = -1;

      await this.loadConfigs();
      this.originalConfigs = JSON.parse(JSON.stringify(this.configs));
    },

    async loadConfigs() {
      this.configs = await getAllConfigs();
      this.currentConfigId = getCurrentConfigId();
    },

    async refreshConfigData() {
      this.items = await getAllItems();
      this.history = await getHistory(50);
      const duration = await getSetting('autoDuration');
      this.autoDuration = duration ? parseInt(duration) || 2000 : 2000;
      this.mainWindowAlwaysOnTop = await getMainWindowAlwaysOnTop();

      this.originalItems = JSON.parse(JSON.stringify(this.items));
      this.originalHistory = JSON.parse(JSON.stringify(this.history));
      this.originalAutoDuration = this.autoDuration;
      this.originalMainWindowAlwaysOnTop = this.mainWindowAlwaysOnTop;
      this.pendingAdds = [];
      this.pendingDeletes = [];
      this.pendingEdits = [];
      this.pendingHistoryClear = false;
      this.isDirty = false;
      this.selectedItemIds = [];
      this.batchWeight = 1;

      this.pendingConfigCreates = [];
      this.pendingConfigDeletes = [];
      this.pendingConfigRenames = [];
      this.pendingConfigCopies = [];
      this.pendingConfigSwitchId = null;
      this.nextTempConfigId = -1;

      const loadedTexts = await getCustomTexts();
      this.customTextFields.forEach(field => {
        if (!loadedTexts[field.key]) {
          loadedTexts[field.key] = field.fallback;
        }
      });
      this.customTexts = loadedTexts;
      this.originalCustomTexts = JSON.parse(JSON.stringify(this.customTexts));

      await this.loadConfigs();
      this.originalConfigs = JSON.parse(JSON.stringify(this.configs));
    },

    async handleCreateConfig() {
      if (!this.newConfigName.trim()) {
        message.error('Config name cannot be empty');
        return;
      }

      const allNames = [
        ...this.configs.map(c => c.name),
        ...this.pendingConfigCreates.map(c => c.name),
        ...this.pendingConfigCopies.map(c => c.newName),
      ];
      const renamedNames = this.pendingConfigRenames.map(r => r.newName);
      if (allNames.includes(this.newConfigName.trim()) || renamedNames.includes(this.newConfigName.trim())) {
        message.error('Config name already exists');
        return;
      }

      const tempId = this.nextTempConfigId--;
      this.pendingConfigCreates.push({ name: this.newConfigName.trim(), tempId });
      this.showCreateConfigModal = false;
      this.newConfigName = '';
      this.checkDirty();
      message.success('Config creation pending, click Save to apply');
    },

    async handleDeleteConfig(id: number) {
      if (this.pendingConfigCreates.some(c => c.tempId === id)) {
        this.pendingConfigCreates = this.pendingConfigCreates.filter(c => c.tempId !== id);
        this.checkDirty();
        message.info('Pending config creation cancelled');
        return;
      }

      if (id === this.currentConfigId) {
        message.error('Cannot delete active config');
        return;
      }

      const idx = this.pendingConfigDeletes.indexOf(id);
      if (idx === -1) {
        this.pendingConfigDeletes.push(id);
        if (this.pendingConfigSwitchId === id) {
          this.pendingConfigSwitchId = null;
        }
        this.checkDirty();
        message.success('Config deletion pending, click Save to apply');
      } else {
        this.pendingConfigDeletes.splice(idx, 1);
        this.checkDirty();
        message.info('Config deletion cancelled');
      }
    },

    async handleSwitchConfig(id: number) {
      if (id === this.currentConfigId) {
        this.pendingConfigSwitchId = null;
      } else {
        this.pendingConfigSwitchId = id;
      }
      this.checkDirty();
    },

    isConfigPendingDelete(id: number | null): boolean {
      if (id === null) return false;
      return this.pendingConfigDeletes.includes(id);
    },
    isConfigActive(config: any): boolean {
      if (config._isPending) {
        return false;
      }
      if (config._isPendingDelete) {
        return false;
      }
      return config.is_active && !this.pendingConfigDeletes.includes(config.id);
    },

    async handleCopyConfig() {
      if (!this.copyConfigName.trim()) {
        message.error('Config name cannot be empty');
        return;
      }
      if (!this.selectedConfigIdForCopy) {
        message.error('Please select a source config');
        return;
      }

      const allNames = [
        ...this.configs.map(c => c.name),
        ...this.pendingConfigCreates.map(c => c.name),
        ...this.pendingConfigCopies.map(c => c.newName),
      ];
      const renamedNames = this.pendingConfigRenames.map(r => r.newName);
      if (allNames.includes(this.copyConfigName.trim()) || renamedNames.includes(this.copyConfigName.trim())) {
        message.error('Config name already exists');
        return;
      }

      const tempId = this.nextTempConfigId--;
      this.pendingConfigCopies.push({ sourceId: this.selectedConfigIdForCopy, newName: this.copyConfigName.trim(), tempId });
      this.showCopyConfigModal = false;
      this.copyConfigName = '';
      this.selectedConfigIdForCopy = null;
      this.checkDirty();
      message.success('Config copy pending, click Save to apply');
    },

    async handleRenameConfig() {
      if (!this.renameConfigName.trim()) {
        message.error('Config name cannot be empty');
        return;
      }
      if (!this.selectedConfigIdForRename) {
        message.error('Please select a config to rename');
        return;
      }

      const allNames = [
        ...this.configs.filter(c => c.id !== this.selectedConfigIdForRename).map(c => c.name),
        ...this.pendingConfigCreates.map(c => c.name),
        ...this.pendingConfigCopies.map(c => c.newName),
      ];
      const renamedNames = this.pendingConfigRenames
        .filter(r => r.id !== this.selectedConfigIdForRename)
        .map(r => r.newName);
      if (allNames.includes(this.renameConfigName.trim()) || renamedNames.includes(this.renameConfigName.trim())) {
        message.error('Config name already exists');
        return;
      }

      const existing = this.pendingConfigRenames.find(r => r.id === this.selectedConfigIdForRename);
      if (existing) {
        existing.newName = this.renameConfigName.trim();
      } else {
        this.pendingConfigRenames.push({ id: this.selectedConfigIdForRename, newName: this.renameConfigName.trim() });
      }
      this.showRenameConfigModal = false;
      this.renameConfigName = '';
      this.selectedConfigIdForRename = null;
      this.checkDirty();
      message.success('Config rename pending, click Save to apply');
    },

    async handleExportConfigs() {
      if (this.exportSelectedConfigIds.length === 0) {
        message.warning('Please select at least one config to export');
        return;
      }

      try {
        const exportData = await exportConfigs(this.exportSelectedConfigIds);
        const jsonStr = JSON.stringify(exportData, null, 2);

        const { save } = await import('@tauri-apps/plugin-dialog');
        const filePath = await save({
          title: 'Save Export File',
          filters: [{
            name: 'JSON',
            extensions: ['json']
          }]
        });

        if (filePath) {
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(filePath, jsonStr);
          message.success(`Successfully exported ${exportData.configs.length} config(s) to ${filePath}`);
          this.showExportModal = false;
          this.exportSelectedConfigIds = [];
        }
      } catch (error) {
        console.error('Export failed:', error);
        message.error('Failed to export configs');
      }
    },

    async handleImportFromFile(file: File): Promise<boolean> {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        try {
          const exportData = JSON.parse(text) as ExportData;
          if (!exportData.configs || !Array.isArray(exportData.configs)) {
            message.error('Invalid export file format');
            return;
          }

          this.configImportText = text;
          this.configImportFileContent = text;
          this.showConfigImportModal = true;
        } catch {
          message.error('Failed to parse export file');
        }
      };
      reader.readAsText(file);
      return false;
    },

    async handleImportConfigs() {
      if (!this.configImportFileContent) {
        message.warning('Please select an export file to import');
        return;
      }

      try {
        const exportData = JSON.parse(this.configImportFileContent) as ExportData;
        const result = await importConfig(exportData);

        if (result.imported.length > 0) {
          message.success(`Successfully imported: ${result.imported.join(', ')}`);
        }
        if (result.errors.length > 0) {
          message.error(`Import errors: ${result.errors.join('; ')}`);
        }

        this.showConfigImportModal = false;
        this.configImportText = '';
        this.configImportFileContent = null;
        await this.loadConfigs();
        await this.refreshConfigData();
        this.$emit('refresh');
      } catch (error) {
        console.error('Import failed:', error);
        message.error('Failed to import configs');
      }
    },

    async openSettingsPanel(): Promise<void> {
      const hasPwd = await hasPassword();
      if (!hasPwd) {
        this.visible = true;
        return;
      }

      this.showPasswordModal = true;
      this.passwordInput = '';
      this.passwordError = '';

      return new Promise<void>((resolve) => {
        this.passwordCallback = (success: boolean) => {
          if (success) {
            this.visible = true;
          }
          resolve();
        };
      });
    },
    async handlePasswordSubmit() {
      if (!this.passwordInput) {
        this.passwordError = 'Please enter password';
        return;
      }

      const success = await verifyPassword(this.passwordInput);
      if (success) {
        this.showPasswordModal = false;
        this.passwordInput = '';
        this.passwordError = '';
        if (this.passwordCallback) {
          this.passwordCallback(true);
          this.passwordCallback = null;
        }
      } else {
        this.passwordError = 'Incorrect password';
      }
    },
    handlePasswordCancel() {
      this.showPasswordModal = false;
      this.passwordInput = '';
      this.passwordError = '';
      if (this.passwordCallback) {
        this.passwordCallback(false);
        this.passwordCallback = null;
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
      const hasAlwaysOnTopChange = this.mainWindowAlwaysOnTop !== this.originalMainWindowAlwaysOnTop;
      const hasCustomTextsChange = JSON.stringify(this.customTexts) !== JSON.stringify(this.originalCustomTexts);
      const hasPasswordChange = this.pendingPasswordChange;
      const hasConfigOps = this.pendingConfigCreates.length > 0 ||
        this.pendingConfigDeletes.length > 0 ||
        this.pendingConfigRenames.length > 0 ||
        this.pendingConfigCopies.length > 0 ||
        this.pendingConfigSwitchId !== null;
      this.isDirty = hasAdds || hasDeletes || hasEdits || hasHistoryClear || hasDurationChange || hasCustomTextsChange || hasPasswordChange || hasAlwaysOnTopChange || hasConfigOps;
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
          this.items = this.items.filter(i => i.id !== id);
        } else {
          const idx = this.pendingDeletes.indexOf(id);
          if (idx === -1) {
            this.pendingDeletes.push(id);
            item._isDeleted = true;
          } else {
            this.pendingDeletes.splice(idx, 1);
            item._isDeleted = false;
          }
        }
        this.checkDirty();
      }
    },
    toggleDeleteItem(id: number) {
      this.handleDeleteItem(id);
    },
    batchToggleDelete() {
      if (this.selectedItemIds.length === 0) return;
      for (const id of this.selectedItemIds) {
        this.toggleDeleteItem(id);
      }
    },
    async handleClearAll() {
      this.pendingDeletes = this.items.filter(i => !(i as any).isNew && !i._isDeleted).map(i => i.id);
      this.items.forEach(item => {
        if (!(item as any).isNew) {
          item._isDeleted = true;
        }
      });
      this.pendingAdds = [];
      this.items = this.items.filter(i => !(i as any).isNew);
      this.checkDirty();
    },
    async handleResetHistory() {
      this.pendingHistoryClear = true;
      this.history = [];
      this.checkDirty();
    },
    selectAllItems() {
      this.selectedItemIds = this.filteredItems.map(i => i.id);
    },
    deselectAllItems() {
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
    showItemImportModal() {
      this.showImport = true;
    },
    async handleFileUpload(file: File) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const text = e.target?.result as string;
        const result = await importFromText(text);
        if (result.items.length === 0) {
          message.warning('No valid items found in file');
        } else {
          let count = 0;
          for (const item of result.items) {
            const exists = this.items.some(i => i.name === item.name) || this.pendingAdds.some(a => a.name === item.name);
            if (exists) continue;

            const tempId = Date.now() + count;
            this.pendingAdds.push({ id: tempId, name: item.name, weight: item.weight, selected_count: 0, disabled: 0 });
            this.items.push({ id: tempId, name: item.name, weight: item.weight, selected_count: 0, disabled: 0, isNew: true });
            count++;
          }
          if (result.errors.length > 0) {
            message.warning(`Added ${count} items, skipped: ${result.errors.join(', ')}`);
          } else {
            message.success(`Added ${count} items to pending list`);
          }
          this.checkDirty();
        }
        this.importText = '';
        this.showImport = false;
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
          this.editingNameKey = null;
          return;
        }
        const item = this.items.find(i => i.id === this.editingNameKey);
        if (item) {
          if ((item as any).isNew) {
            const idx = this.items.indexOf(item);
            const updated = { ...item, name: this.editName.trim() };
            this.items.splice(idx, 1, updated);
            const pending = this.pendingAdds.find(p => p.id === this.editingNameKey);
            if (pending) pending.name = this.editName.trim();
          } else {
            const existingEdit = this.pendingEdits.find(e => e.id === this.editingNameKey);
            if (existingEdit) {
              existingEdit.name = this.editName.trim();
            } else {
              this.pendingEdits.push({ id: this.editingNameKey, name: this.editName.trim() });
            }
            const idx = this.items.indexOf(item);
            const updated = { ...item, name: this.editName.trim() };
            this.items.splice(idx, 1, updated);
          }
        }
        this.editingNameKey = null;
        this.checkDirty();
      }
      if (this.editingWeightKey !== null) {
        const item = this.items.find(i => i.id === this.editingWeightKey);
        if (item) {
          if ((item as any).isNew) {
            const idx = this.items.indexOf(item);
            const updated = { ...item, weight: this.editWeight };
            this.items.splice(idx, 1, updated);
            const pending = this.pendingAdds.find(p => p.id === this.editingWeightKey);
            if (pending) pending.weight = this.editWeight;
          } else {
            const existingEdit = this.pendingEdits.find(e => e.id === this.editingWeightKey);
            if (existingEdit) {
              existingEdit.weight = this.editWeight;
            } else {
              this.pendingEdits.push({ id: this.editingWeightKey, weight: this.editWeight });
            }
            const idx = this.items.indexOf(item);
            const updated = { ...item, weight: this.editWeight };
            this.items.splice(idx, 1, updated);
          }
        }
        this.editingWeightKey = null;
        this.checkDirty();
      }
    },
    cancelEdits() {
      this.editingNameKey = null;
      this.editingWeightKey = null;
    },
    onEditBlur() {
      setTimeout(() => {
        const activeEl = document.activeElement;
        const isStillEditingName = this.editingNameKey !== null && activeEl && activeEl.closest(`[data-edit-name="${this.editingNameKey}"]`);
        const isStillEditingWeight = this.editingWeightKey !== null && activeEl && activeEl.closest(`[data-edit-weight="${this.editingWeightKey}"]`);
        
        if (!isStillEditingName && !isStillEditingWeight) {
          this.saveAllEdits();
        }
      }, 200);
    },
    async handleSave() {
      const hasPwd = await hasPassword();
      if (hasPwd) {
        const verified = await new Promise<boolean>((resolve) => {
          this.showPasswordModal = true;
          this.passwordInput = '';
          this.passwordError = '';
          this.passwordCallback = (success: boolean) => {
            resolve(success);
          };
        });
        if (!verified) return;
      }

      if (this.pendingPasswordChange) {
        if (this.pendingRemovePassword) {
          await setSetting('admin_password_hash', '');
          this.hasPassword = false;
        } else {
          await setPassword(this.pendingNewPassword);
          this.hasPassword = true;
        }
        this.pendingPasswordChange = false;
        this.pendingRemovePassword = false;
        this.pendingNewPassword = '';
      }

      for (const create of this.pendingConfigCreates) {
        const result = await createConfig(create.name);
        if (result.config && result.config.id !== undefined) {
          if (this.pendingConfigSwitchId === create.tempId) {
            await switchConfig(result.config.id);
          }
        }
      }

      for (const copy of this.pendingConfigCopies) {
        const result = await copyConfig(copy.sourceId, copy.newName);
        if (result.config && result.config.id !== undefined) {
          if (this.pendingConfigSwitchId === copy.tempId) {
            await switchConfig(result.config.id);
          }
        }
      }

      for (const id of this.pendingConfigDeletes) {
        await deleteConfig(id);
      }

      for (const rename of this.pendingConfigRenames) {
        await renameConfig(rename.id, rename.newName);
      }

      if (this.pendingConfigSwitchId !== null) {
        const isPendingCreate = this.pendingConfigCreates.some(c => c.tempId === this.pendingConfigSwitchId);
        const isPendingCopy = this.pendingConfigCopies.some(c => c.tempId === this.pendingConfigSwitchId);
        if (!isPendingCreate && !isPendingCopy) {
          await switchConfig(this.pendingConfigSwitchId);
        }
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
       
       const alwaysOnTopChanged = this.mainWindowAlwaysOnTop !== this.originalMainWindowAlwaysOnTop;
       await setMainWindowAlwaysOnTop(this.mainWindowAlwaysOnTop);
       if (alwaysOnTopChanged) {
         try {
           await invoke('set_main_window_always_on_top', { alwaysOnTop: this.mainWindowAlwaysOnTop });
         } catch (e) {
           console.error('Failed to apply always on top:', e);
         }
       }
       
       await saveCustomTexts(this.customTexts);

      await this.loadData();
      this.$emit('refresh');

      try {
        await invoke('emit_custom_texts_updated');
      } catch (e) {
        console.error('Failed to emit custom texts updated event:', e);
      }

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
      this.pendingNewPassword = this.newPassword;
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
        const date = new Date(utcString.replace(' ', 'T') + 'Z');
        if (isNaN(date.getTime())) {
          const date2 = new Date(utcString);
          if (!isNaN(date2.getTime())) {
            return date2.toLocaleString();
          }
          return utcString;
        }
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
    isNameChanged(record: any): boolean {
      if ((record as any).isNew) return false;
      const original = this.originalItems.find(i => i.id === record.id);
      if (!original) return false;
      return record.name !== original.name;
    },
    isWeightChanged(record: any): boolean {
      if ((record as any).isNew) return false;
      const original = this.originalItems.find(i => i.id === record.id);
      if (!original) return false;
      return record.weight !== original.weight;
    },
    isDisabledChanged(record: any): boolean {
      if ((record as any).isNew) return false;
      const original = this.originalItems.find(i => i.id === record.id);
      if (!original) return false;
      return record.disabled !== original.disabled;
    },
    async handleForceReload() {
      try {
        await invoke('force_reload');
        message.success('Application reloading...');
      } catch (e) {
        message.error('Failed to reload application');
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
          <a-form-item label="Force Reload">
            <a-button danger @click="handleForceReload">Force Reload Application</a-button>
          </a-form-item>
          <a-divider style="margin: 12px 0;" />
          <a-form-item label="Configuration">
            <a-space style="width: 100%" direction="vertical">
              <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                <a-select
                  :value="effectiveConfigId"
                  style="flex: 1; min-width: 200px"
                  @change="(val: any) => handleSwitchConfig(val)"
                >
                  <a-select-option v-for="config in displayConfigs" :key="config.id" :value="config.id">
                    <span :style="{ textDecoration: config._isPendingDelete ? 'line-through' : 'none', color: config._isPendingDelete ? '#999' : 'inherit' }">
                      {{ config._pendingNewName || config.name }}
                      <template v-if="isConfigActive(config)">(Active)</template>
                      <a-tag v-if="config._isPending" color="blue" size="small" style="margin-left: 4px;">New</a-tag>
                      <a-tag v-if="config._isPendingRename" color="orange" size="small" style="margin-left: 4px;">Pending Rename</a-tag>
                      <a-tag v-if="config._isPendingDelete" color="red" size="small" style="margin-left: 4px;">Pending Delete</a-tag>
                    </span>
                  </a-select-option>
                </a-select>
                <a-button type="primary" @click="showCreateConfigModal = true; newConfigName = ''">
                  New
                </a-button>
                <a-button @click="showCopyConfigModal = true; copyConfigName = ''; selectedConfigIdForCopy = currentConfigId">
                  Copy From
                </a-button>
                <a-button danger @click="handleDeleteConfig(effectiveConfigId!)" :disabled="displayConfigs.length <= 1 || effectiveConfigId === null">Toggle Delete</a-button>
                <a-button
                  @click="showRenameConfigModal = true; renameConfigName = (displayConfigs.find(c => c.id === effectiveConfigId)?._pendingNewName || displayConfigs.find(c => c.id === effectiveConfigId)?.name || ''); selectedConfigIdForRename = effectiveConfigId"
                  :disabled="effectiveConfigId === null"
                >
                  Rename
                </a-button>
                <a-button type="primary" @click="showExportModal = true; exportSelectedConfigIds = [effectiveConfigId!]">
                  Export
                </a-button>
                <a-button>
                  <a-upload :before-upload="handleImportFromFile" :show-upload-list="false" accept=".json">
                    Import
                  </a-upload>
                </a-button>
              </div>
            </a-space>
          </a-form-item>
          <a-divider style="margin: 12px 0;" />
          <a-form-item label="Auto Duration (ms)">
            <a-input-number v-model:value="autoDuration" :min="0" :max="60000" :step="500" @change="checkDirty" style="width: 100%" />
          </a-form-item>
          <a-form-item label="Main Window Always On Top">
            <a-switch v-model:checked="mainWindowAlwaysOnTop" @change="checkDirty" />
          </a-form-item>
        </a-form>
      </a-tab-pane>
      <a-tab-pane key="items" tab="Items">
        <div class="items-toolbar mb-3">
          <a-button @click="showItemImportModal">Import</a-button>
          <a-popconfirm title="Clear all items?" @confirm="handleClearAll" ok-text="Yes" cancel-text="No">
            <a-button danger :disabled="items.length === 0">Clear All</a-button>
          </a-popconfirm>
          <a-button @click="selectAllItems">Select All</a-button>
          <a-button @click="deselectAllItems">Deselect All</a-button>
          <a-button danger @click="batchToggleDelete" :disabled="selectedItemIds.length === 0">Toggle Delete ({{ selectedItemIds.length }})</a-button>
          <a-button @click="batchToggleDisable" :disabled="selectedItemIds.length === 0">
            Toggle Disable
          </a-button>
          <span class="set-weight-group">
            <a-button :disabled="selectedItemIds.length === 0" @click="batchUpdateWeight">Set Weight</a-button>
            <a-input-number v-model:value="batchWeight" :min="0.01" :max="1000" :step="0.1" size="small" style="width: 80px" />
          </span>
        </div>
        <a-form layout="inline" class="mb-3">
          <a-form-item>
            <a-input v-model:value="newItemName" placeholder="Name" @keyup.enter="handleAddItem" style="width: 200px" />
          </a-form-item>
          <a-form-item>
            <a-button type="primary" @click="handleAddItem">Add</a-button>
          </a-form-item>
          <a-form-item>
            <a-radio-group v-model:value="itemFilter" button-style="solid" size="small">
              <a-radio-button value="all">All</a-radio-button>
              <a-radio-button value="active">Active</a-radio-button>
              <a-radio-button value="disabled">Disabled</a-radio-button>
            </a-radio-group>
          </a-form-item>
          <a-form-item>
            <a-input v-model:value="searchQuery" placeholder="Search by name..." allow-clear style="width: 200px" />
          </a-form-item>
        </a-form>
        <a-table :dataSource="filteredItems" :columns="itemColumns" row-key="id" size="small">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'id'">
              <span v-if="(record as any).isNew" style="color: #bfbfbf;">—</span>
              <span v-else>{{ record.id }}</span>
            </template>
            <template v-if="column.key === 'selected'">
              <a-checkbox :checked="isSelected(record.id)" @change="toggleSelection(record.id)" />
            </template>
            <template v-if="column.key === 'name'">
              <a-input
                v-if="editingNameKey === record.id"
                v-model:value="editName"
                size="small"
                style="width: 120px"
                :data-edit-name="record.id"
                @blur="onEditBlur"
                @pressEnter="saveAllEdits"
                @dblclick.stop
              />
              <span v-else @click.stop="startEditName(record)" @dblclick.stop :style="{ cursor: 'pointer', textDecoration: record._isDeleted ? 'line-through' : 'none', color: record._isDeleted ? '#999' : 'inherit' }">
                <span :style="{ backgroundColor: isNameChanged(record) ? '#fff3e0' : 'transparent', padding: '2px 4px', borderRadius: '2px' }">
                  {{ record.name }}
                  <a-tag v-if="isNameChanged(record)" color="orange" size="small" style="margin-left: 4px;">Modified</a-tag>
                  <a-tag v-if="(record as any).isNew" color="blue" size="small" style="margin-left: 4px;">New</a-tag>
                </span>
              </span>
            </template>
            <template v-else-if="column.key === 'weight'">
              <a-input-number
                v-if="editingWeightKey === record.id"
                v-model:value="editWeight"
                :min="0.01"
                :max="1000"
                :step="0.1"
                size="small"
                style="width: 80px"
                :data-edit-weight="record.id"
                @blur="onEditBlur"
                @pressEnter="saveAllEdits"
                @dblclick.stop
              />
              <span v-else @click.stop="startEditWeight(record)" @dblclick.stop style="cursor: pointer;">
                <span :style="{ backgroundColor: isWeightChanged(record) ? '#fff3e0' : 'transparent', padding: '2px 4px', borderRadius: '2px' }">
                  {{ typeof record.weight === 'number' ? record.weight.toFixed(2).replace(/\.?0+$/, '') : record.weight }}
                  <a-tag v-if="isWeightChanged(record)" color="orange" size="small" style="margin-left: 4px;">Modified</a-tag>
                </span>
              </span>
            </template>
            <template v-else-if="column.key === 'disabled'">
              <a-tag v-if="record._isDeleted" color="red">Pending Delete</a-tag>
              <a-tag v-else :color="record.disabled ? 'red' : 'green'">
                {{ record.disabled ? 'Disabled' : 'Active' }}
              </a-tag>
              <a-tag v-if="isDisabledChanged(record)" color="orange" size="small">Modified</a-tag>
            </template>
            <template v-else-if="column.key === 'actions'">
              <a-button type="text" size="small" @click="updateItemDisabled(record.id, record.disabled ? 0 : 1)" :disabled="record._isDeleted">
                {{ record.disabled ? 'Enable' : 'Disable' }}
              </a-button>
              <a-popconfirm :title="record._isDeleted ? 'Undelete?' : 'Delete?'" @confirm="handleDeleteItem(record.id)" ok-text="Yes" cancel-text="No">
                <a-button type="text" size="small" :style="{ color: record._isDeleted ? '#52c41a' : '#ff4d4f' }">
                  {{ record._isDeleted ? 'Undelete' : 'Delete' }}
                </a-button>
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
          <a-divider orientation="left">Main Interface</a-divider>
          <a-form-item v-for="field in mainInterfaceFields" :key="field.key" :label="field.label">
            <a-switch
              v-if="field.key === 'showAuthor'"
              :checked="customTexts[field.key] === 'true'"
              :disabled="!customTexts.authorName"
              @change="(val: boolean) => updateCustomText(field.key, val ? 'true' : 'false')"
            />
            <a-switch
              v-else-if="field.type === 'switch'"
              :checked="customTexts[field.key] === 'true'"
              @change="(val: boolean) => updateCustomText(field.key, val ? 'true' : 'false')"
            />
            <a-input
              v-else
              v-model:value="customTexts[field.key]"
              :placeholder="field.fallback"
              @change="updateCustomText(field.key, customTexts[field.key])"
            />
          </a-form-item>
          <a-divider orientation="left">Floating Window</a-divider>
          <a-form-item v-for="field in windowControlFields" :key="field.key" :label="field.label">
            <a-input
              v-model:value="customTexts[field.key]"
              :placeholder="field.fallback"
              @change="updateCustomText(field.key, customTexts[field.key])"
            />
          </a-form-item>
          <a-divider orientation="left">Tray Icon</a-divider>
          <a-form-item v-for="field in trayIconFields" :key="field.key" :label="field.label">
            <a-input
              v-model:value="customTexts[field.key]"
              :placeholder="field.fallback"
              @change="updateCustomText(field.key, customTexts[field.key])"
            />
          </a-form-item>
          <a-divider orientation="left">Other</a-divider>
          <a-form-item v-for="field in otherFields" :key="field.key" :label="field.label">
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

  <a-modal v-model:open="showPasswordModal" title="Enter Password" @ok="handlePasswordSubmit" @cancel="handlePasswordCancel" ok-text="OK" cancel-text="Cancel" :getContainer="false" :zIndex="2000">
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

  <!-- Create Config Modal -->
  <a-modal v-model:open="showCreateConfigModal" title="Create New Config" @ok="handleCreateConfig" ok-text="Create" cancel-text="Cancel">
    <a-form layout="vertical">
      <a-form-item label="Config Name">
        <a-input v-model:value="newConfigName" placeholder="Enter config name" @keyup.enter="handleCreateConfig" />
      </a-form-item>
    </a-form>
  </a-modal>

  <!-- Copy Config Modal -->
  <a-modal v-model:open="showCopyConfigModal" title="Copy Config" @ok="handleCopyConfig" ok-text="Copy" cancel-text="Cancel">
    <a-form layout="vertical">
      <a-form-item label="New Config Name">
        <a-input v-model:value="copyConfigName" placeholder="Enter new config name" @keyup.enter="handleCopyConfig" />
      </a-form-item>
      <a-form-item label="Copy From">
        <a-select v-model:value="selectedConfigIdForCopy" placeholder="Select a source config">
          <a-select-option v-for="config in displayConfigs.filter(c => !c._isPending && !pendingConfigDeletes.includes(c.id))" :key="config.id" :value="config.id">
            {{ config._pendingNewName || config.name }}
          </a-select-option>
        </a-select>
      </a-form-item>
      <a-alert type="info" message="This will copy all items and settings from the selected config. History will not be copied." show-icon />
    </a-form>
  </a-modal>

  <!-- Rename Config Modal -->
  <a-modal v-model:open="showRenameConfigModal" title="Rename Config" @ok="handleRenameConfig" ok-text="Rename" cancel-text="Cancel">
    <a-form layout="vertical">
      <a-form-item label="New Config Name">
        <a-input v-model:value="renameConfigName" placeholder="Enter new config name" @keyup.enter="handleRenameConfig" />
      </a-form-item>
    </a-form>
  </a-modal>

  <!-- Export Config Modal -->
  <a-modal v-model:open="showExportModal" title="Export Configs" @ok="handleExportConfigs" ok-text="Export" cancel-text="Cancel">
    <a-form layout="vertical">
      <a-form-item label="Select Configs to Export">
        <a-checkbox
          :checked="exportSelectedConfigIds.length === displayConfigs.filter(c => !pendingConfigDeletes.includes(c.id)).length"
          :indeterminate="exportSelectedConfigIds.length > 0 && exportSelectedConfigIds.length < displayConfigs.filter(c => !pendingConfigDeletes.includes(c.id)).length"
          @change="(e: any) => exportSelectedConfigIds = e.target.checked ? displayConfigs.filter(c => !pendingConfigDeletes.includes(c.id)).map((c: any) => c.id) : []"
        >
          Select All
        </a-checkbox>
      </a-form-item>
      <a-divider style="margin: 8px 0;" />
      <a-checkbox-group v-model:value="exportSelectedConfigIds" style="width: 100%">
        <a-row :gutter="[8, 8]">
          <a-col :span="12" v-for="config in displayConfigs.filter(c => !c._isPendingDelete)" :key="config.id">
            <a-checkbox :value="config.id">
              {{ config._pendingNewName || config.name }}
              <template v-if="isConfigActive(config)">(Active)</template>
            </a-checkbox>
          </a-col>
        </a-row>
      </a-checkbox-group>
      <a-alert type="info" message="Exported data includes all items, settings, and history for selected configs." show-icon />
    </a-form>
  </a-modal>

  <!-- Import Config Modal -->
  <a-modal v-model:open="showConfigImportModal" title="Import Configs" @ok="handleImportConfigs" ok-text="Import" cancel-text="Cancel">
    <a-form layout="vertical">
      <a-alert type="warning" message="Importing will overwrite existing configs with the same name. History in existing configs will be cleared before import." show-icon />
      <a-divider style="margin: 12px 0;" />
      <a-form-item label="Preview">
        <a-textarea v-model:value="configImportText" :rows="8" readonly />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<style scoped>
.mb-3 {
  margin-bottom: 12px;
}

.items-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.set-weight-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

button,
.ant-btn {
  cursor: default;
}

button:hover,
.ant-btn:hover {
  cursor: default;
}
.history-time {
  font-size: 12px;
  color: #999;
  margin-right: 8px;
}
</style>