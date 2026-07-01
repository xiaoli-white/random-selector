<template>
  <div class="floating-window" data-tauri-drag-region>
    <template v-if="isDataLoaded">
      <div class="content-row">
        <div class="drag-handle">
          <span class="drag-icon">⋮⋮</span>
        </div>
        <a-button type="primary" @click="toggleMainInterface" class="toggle-button" size="large">
          {{ toggleButtonText }}
        </a-button>
        <a-button type="text" @click="toggleExpand" class="expand-button" size="large">
          {{ isExpanded ? '▲' : '▼' }}
        </a-button>
      </div>
      <div v-if="isExpanded" class="quick-pick-area" @click="handleQuickPick">
        <span v-if="!quickPickItem">{{ t('floatingQuickPickHint', 'Click to pick') }}</span>
        <span v-else class="pick-result">{{ quickPickItem.name }}</span>
      </div>
    </template>
  </div>
</template>

<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { message } from 'ant-design-vue';
import { getCustomTexts, onConfigChanged, syncCurrentConfigId, getAllItems, getFloatingWindowExpanded, setFloatingWindowExpanded, weightedRandomSelect, addHistoryRecord } from './db';

export default {
  name: 'FloatingWindow',
  data() {
    return {
      showMainInterface: true,
      customTexts: {} as Record<string, string>,
      isDataLoaded: false,
      isExpanded: false,
      quickPickItem: null as { name: string; id?: number } | null,
      items: [] as any[],
      quickPicking: false,
    };
  },
  computed: {
    t() {
      return (key: string, fallback: string) => this.customTexts[key] || fallback;
    },
    toggleButtonText() {
      return this.showMainInterface ? this.t('btnHideMain', 'Hide Main') : this.t('btnShowMain', 'Show Main');
    },
  },
  async mounted() {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    listen('custom-texts-updated', async () => {
      await this.loadCustomTexts();
    }).catch(e => console.error('Failed to listen custom-texts-updated:', e));

    listen('window-state-changed', async () => {
      await this.syncWindowState();
    }).catch(e => console.error('Failed to listen window-state-changed:', e));

    listen('config-changed', async () => {
      await syncCurrentConfigId();
      await this.loadCustomTexts();
      await this.loadItems();
    }).catch(e => console.error('Failed to listen config-changed:', e));

    onConfigChanged(async () => {
      await syncCurrentConfigId();
      await this.loadCustomTexts();
      await this.loadItems();
    });

    try {
      await Promise.all([
        this.loadCustomTexts().catch(e => console.error('Failed to load custom texts:', e)),
        this.syncWindowState().catch(e => console.error('Failed to sync window state:', e)),
        this.loadItems().catch(e => console.error('Failed to load items:', e)),
        this.restoreFloatingWindowExpanded().catch(e => console.error('Failed to restore expanded state:', e)),
      ]);
    } catch (e) {
      console.error('Floating window initialization error:', e);
    }

    this.isDataLoaded = true;
    this.hideLoading();
  },
  methods: {
    async loadCustomTexts() {
      this.customTexts = await getCustomTexts();
    },
    async syncWindowState() {
      try {
        this.showMainInterface = await invoke('is_main_window_visible');
      } catch (e) {
        console.error('Failed to sync window state:', e);
      }
    },
    async toggleMainInterface() {
      try {
        if (this.showMainInterface) {
          await invoke('hide_main_window');
        } else {
          await invoke('show_main_window');
        }
        this.showMainInterface = !this.showMainInterface;
        await this.emitWindowStateChange();
      } catch (error) {
        message.error(this.t('errorToggleWindow', 'Failed to toggle main window'));
      }
    },
    async emitWindowStateChange() {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('window-state-changed');
    },
    async toggleExpand() {
      this.isExpanded = !this.isExpanded;
      const height = this.isExpanded ? 180.0 : 48.0;
      try {
        await invoke('set_floating_window_size', { width: 190.0, height });
      } catch (e) {
        console.error('Failed to resize floating window:', e);
      }
      await this.saveFloatingWindowExpanded();
    },
    async saveFloatingWindowExpanded() {
      try {
        await setFloatingWindowExpanded(this.isExpanded);
      } catch (e) {
        console.error('Failed to save floating window expanded state:', e);
      }
    },
    async restoreFloatingWindowExpanded() {
      try {
        this.isExpanded = await getFloatingWindowExpanded();
        if (this.isExpanded) {
          await invoke('set_floating_window_size', { width: 190.0, height: 180.0 });
        }
      } catch (e) {
        console.error('Failed to restore floating window expanded state:', e);
      }
    },
    async loadItems() {
      try {
        await syncCurrentConfigId();
        this.items = await getAllItems();
      } catch (e) {
        console.error('Failed to load items for floating window:', e);
      }
    },
    async handleQuickPick() {
      if (this.quickPicking) return;
      this.quickPicking = true;
      try {
        await this.loadItems();
        const activeItems = this.items.filter((i: any) => !i.disabled);
        if (activeItems.length === 0) {
          message.info(this.t('errorNoActiveItems', 'No active items available'));
          this.quickPickItem = null;
          return;
        }
        const picked = weightedRandomSelect(activeItems);
        if (picked) {
          await addHistoryRecord(picked.id!, picked.name);
          this.quickPickItem = { name: picked.name, id: picked.id };
        }
      } catch (e) {
        console.error('Quick pick failed:', e);
      } finally {
        this.quickPicking = false;
      }
    },
    hideLoading() {
      const el = document.getElementById('app-loading');
      if (el) {
        el.classList.add('hidden');
        setTimeout(() => el.remove(), 300);
      }
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
  background: transparent;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  overflow: hidden;
  margin: 0;
  padding: 0;
  -webkit-app-region: drag;
}

.floating-window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  user-select: none;
  position: fixed;
  top: 0;
  left: 0;
}

.content-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  height: 48px;
  flex-shrink: 0;
  width: 100%;
}

.drag-handle {
  width: 32px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px 0 0 0;
  flex-shrink: 0;
}

.drag-icon {
  color: rgba(0, 0, 0, 0.3);
  font-size: 14px;
  letter-spacing: 2px;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  writing-mode: vertical-rl;
}

.toggle-button {
  flex: 1;
  height: calc(100% - 8px);
  margin: 4px 0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  -webkit-app-region: no-drag;
}

.expand-button {
  width: 28px;
  height: 100%;
  margin: 0 8px 0 0;
  border: none;
  font-size: 11px;
  padding: 0;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
  color: rgba(0, 0, 0, 0.35);
}

.quick-pick-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  cursor: pointer;
  font-size: 20px;
  color: #666;
  padding: 0 16px;
  text-align: center;
  min-height: 0;
  -webkit-app-region: no-drag;
}

.quick-pick-area:hover {
  background: rgba(0, 0, 0, 0.03);
}

.pick-result {
  font-weight: 700;
  color: #222;
  font-size: 28px;
}
</style>