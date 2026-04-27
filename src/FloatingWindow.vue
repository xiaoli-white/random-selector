<template>
  <div class="floating-window">
    <div class="drag-handle" data-tauri-drag-region>
      <span class="drag-icon">⋮⋮</span>
    </div>
    <a-button type="primary" @click="toggleMainInterface" class="toggle-button" size="large">
      {{ t('btnToggleMain', 'Toggle Main') }}
    </a-button>
  </div>
</template>

<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { message } from 'ant-design-vue';
import { getCustomTexts } from './db';

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
  },
  async mounted() {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    await this.loadCustomTexts();
    
    await listen('custom-texts-updated', async () => {
      await this.loadCustomTexts();
    });
  },
  methods: {
    async loadCustomTexts() {
      this.customTexts = await getCustomTexts();
    },
    async toggleMainInterface() {
      try {
        if (this.showMainInterface) {
          await invoke('hide_main_window');
        } else {
          await invoke('show_main_window');
        }
        this.showMainInterface = !this.showMainInterface;
      } catch (error) {
        message.error(this.t('errorToggleWindow', 'Failed to toggle main window'));
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
}

.drag-handle {
  width: 48px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: drag;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 8px 0 0 8px;
}

.drag-icon {
  color: rgba(0, 0, 0, 0.3);
  font-size: 16px;
  letter-spacing: 2px;
  line-height: 1;
  pointer-events: none;
  user-select: none;
  writing-mode: vertical-rl;
}

.toggle-button {
  width: calc(100% - 8px);
  height: calc(100% - 8px);
  margin: 4px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
}
</style>