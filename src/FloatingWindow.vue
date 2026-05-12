<template>
  <div class="floating-window" data-tauri-drag-region>
    <div class="drag-handle">
      <span class="drag-icon">⋮⋮</span>
    </div>
    <a-button type="primary" @click="toggleMainInterface" class="toggle-button" size="large">
      {{ toggleButtonText }}
    </a-button>
  </div>
</template>

<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { message } from 'ant-design-vue';
import { getCustomTexts, onConfigChanged, syncCurrentConfigId } from './db';

export default {
  name: 'FloatingWindow',
  data() {
    return {
      showMainInterface: true,
      customTexts: {} as Record<string, string>,
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
    await this.loadCustomTexts();
    await this.syncWindowState();

    await listen('custom-texts-updated', async () => {
      await this.loadCustomTexts();
    });

    await listen('window-state-changed', async () => {
      await this.syncWindowState();
    });

    onConfigChanged(async () => {
      await syncCurrentConfigId();
      await this.loadCustomTexts();
    });

    await listen('config-changed', async () => {
      await syncCurrentConfigId();
      await this.loadCustomTexts();
    });
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
  flex-direction: row;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  user-select: none;
  position: fixed;
  top: 0;
  left: 0;
}

.drag-handle {
  width: 32px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px 0 0 8px;
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
  width: calc(100% - 32px);
  height: calc(100% - 8px);
  margin: 4px 4px 4px 0;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  -webkit-app-region: no-drag;
}
</style>