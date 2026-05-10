<script lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { message } from 'ant-design-vue';
import { initDatabase, getAllItems, getHistory, getSetting, weightedRandomSelect, addHistoryRecord, getCustomTexts, Item, getFloatingWindowState, setFloatingWindowState, getMainWindowAlwaysOnTop, getAllConfigs, switchConfig, getCurrentConfigId, onConfigChanged } from './db';
import SettingsModal from './components/SettingsModal.vue';

// @ts-ignore
import packageJson from '../package.json';

interface SettingsModalInstance {
  openSettingsPanel: () => Promise<void>;
}

export default {
  name: 'App',
  components: { SettingsModal },
  data() {
    return {
      items: [] as Item[],
      history: [] as any[],
      selectedItem: null as Item | null,
      isSelecting: false,
      isAutoSelecting: false,
      showSettings: false,
      showFloating: false,
      showMainInterface: true,
      autoDuration: 2000,
      intervalId: null as number | null,
      stopTimeoutId: null as number | null,
      animationFrame: null as number | null,
      isAnimating: false,
      customTexts: {} as Record<string, string>,
      appVersion: packageJson.version as string,
      configs: [] as any[],
      currentConfigId: null as number | null,
    };
  },
  computed: {
    t() {
      return (key: string, fallback: string) => this.customTexts[key] || fallback;
    },
    activeItems() {
      return this.items.filter(i => !i.disabled);
    },
    showVersion() {
      return this.t('showVersion', 'true') === 'true';
    },
    showAuthor() {
      return this.t('showAuthor', 'true') === 'true';
    },
    authorName() {
      return this.t('authorName', '');
    },
  },
  async mounted() {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
    await initDatabase();
    await this.loadCustomTexts();
    await this.loadItems();
    await this.loadHistory();
    await this.loadSettings();
    await this.loadConfigs();
    await this.restoreFloatingWindowState();
    await this.setupWindowCloseHandler();
    this.setupVisibilityWatcher();

    await listen('custom-texts-updated', async () => {
      await this.loadCustomTexts();
    });

    onConfigChanged(async () => {
      await this.loadItems();
      await this.loadHistory();
      await this.loadSettings();
      await this.loadConfigs();
    });

    await listen('config-changed', async () => {
      await this.loadItems();
      await this.loadHistory();
      await this.loadSettings();
      await this.loadConfigs();
    });
  },
  beforeUnmount() {
    this.stopAutoSelect();
    this.stopAnimation();
    this.saveFloatingWindowState();
  },
  methods: {
    async loadCustomTexts() {
      this.customTexts = await getCustomTexts();
      const title = this.t('windowTitle', 'Random Selector');
      document.title = title;
      try {
        await invoke('set_window_title', { title });
        await this.updateTrayMenu();
      } catch (e) {
        console.error('Failed to set window title:', e);
      }
    },
    async updateTrayMenu() {
      try {
        await invoke('update_tray_menu', {
          toggleText: this.t('trayToggleMain', 'Toggle Main'),
          quitText: this.t('trayQuit', 'Quit')
        });
      } catch (e) {
        console.error('Failed to update tray menu:', e);
      }
    },
    async restoreFloatingWindowState() {
      const enabled = await getFloatingWindowState();
      if (enabled && !this.showFloating) {
        await this.toggleFloating();
      }
    },
    saveFloatingWindowState() {
      setFloatingWindowState(this.showFloating);
    },
    async setupWindowCloseHandler() {
      const appWindow = getCurrentWindow();
      await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();
        this.saveFloatingWindowState();

        if (this.isSelecting || this.isAutoSelecting || this.isAnimating) {
          this.stopAnimation();
          this.stopAutoSelect();
          this.isSelecting = false;
          this.isAutoSelecting = false;
        }

        await invoke('hide_main_window');
        setTimeout(() => this.updateTrayMenu(), 100);
      });
    },
    setupVisibilityWatcher() {
      const appWindow = getCurrentWindow();
      let lastKnownState = true;

      setInterval(async () => {
        try {
          const isVisible = await appWindow.isVisible();
          const isMinimized = await appWindow.isMinimized();
          const currentState = isVisible && !isMinimized;

          if (currentState !== lastKnownState) {
            lastKnownState = currentState;
            this.showMainInterface = currentState;
          }
        } catch (e) {
        }
      }, 500);
    },
    async toggleFloating() {
      try {
        if (this.showFloating) {
          await invoke('hide_floating_window');
        } else {
          await invoke('show_floating_window');
        }
        this.showFloating = !this.showFloating;
        this.saveFloatingWindowState();
      } catch (error) {
        message.error(this.t('errorFloatingWindow', 'Failed to toggle floating window'));
      }
    },
    async loadItems() {
      this.items = await getAllItems();
    },
    async loadHistory() {
      this.history = await getHistory(50);
    },
    async loadSettings() {
      const duration = await getSetting('autoDuration');
      if (duration) this.autoDuration = parseInt(duration) || 2000;
      const alwaysOnTop = await getMainWindowAlwaysOnTop();
      try {
        await invoke('set_main_window_always_on_top', { alwaysOnTop });
      } catch (e) {
        console.error('Failed to set main window always on top:', e);
      }
    },
    async loadConfigs() {
      this.configs = await getAllConfigs();
      this.currentConfigId = getCurrentConfigId();
    },
    async handleSwitchConfig(id: number) {
      try {
        const result = await switchConfig(id);
        if (result.success) {
          this.currentConfigId = id;
          await this.loadItems();
          await this.loadHistory();
          message.success('Config switched successfully');
        } else {
          message.error(result.error || 'Failed to switch config');
        }
      } catch (error) {
        message.error('Failed to switch config');
      }
    },
    getRandomItemPreview() {
      if (this.activeItems.length === 0) return null;
      return weightedRandomSelect(this.activeItems);
    },
    async recordSelectedItem() {
      if (!this.selectedItem) return;
      const recordedItem = { ...this.selectedItem };
      try {
        await addHistoryRecord(recordedItem.id!, recordedItem.name);
        await this.loadHistory();
        await this.loadItems();
        this.selectedItem = recordedItem;
      } catch (error) {
        message.error(this.t('errorRecordFailed', 'Failed to record selection'));
      }
    },
    startManualSelect() {
      if (this.activeItems.length === 0) {
        message.warning(this.t('errorNoActiveItems', 'No active items available'));
        return;
      }
      this.isSelecting = true;
      this.startAnimation();
    },
    stopManualSelect() {
      this.stopAnimation();
      this.recordSelectedItem();
      this.isSelecting = false;
    },
    startAnimation() {
      this.isAnimating = true;
      const delay = 100;
      const animate = () => {
        if (!this.isAnimating) return;
        this.selectedItem = this.getRandomItemPreview();
        this.animationFrame = window.setTimeout(animate, delay) as unknown as number;
      };
      animate();
    },
    stopAnimation() {
      this.isAnimating = false;
      if (this.animationFrame) {
        clearTimeout(this.animationFrame);
        this.animationFrame = null;
      }
    },
    async startAutoSelect() {
      if (this.activeItems.length === 0) {
        message.warning(this.t('errorNoActiveItems', 'No active items available'));
        return;
      }
      this.isAutoSelecting = true;

      if (this.autoDuration === 0) {
        const item = this.getRandomItemPreview();
        if (item) {
          this.selectedItem = { ...item };
        }
        this.stopAutoSelect();
        return;
      }

      const startTime = performance.now();
      const intervalDelay = 100;

      const updatePreview = () => {
        if (this.activeItems.length === 0) return;
        const preview = this.getRandomItemPreview();
        if (preview) {
          this.selectedItem = { ...preview };
        }
      };

      const tick = () => {
        if (!this.isAutoSelecting) return;
        updatePreview();
        const elapsed = performance.now() - startTime;
        if (elapsed < this.autoDuration - intervalDelay) {
          this.intervalId = window.setTimeout(tick, intervalDelay) as unknown as number;
        } else {
          updatePreview();
          this.stopAutoSelect();
        }
      };

      updatePreview();
      this.intervalId = window.setTimeout(tick, intervalDelay) as unknown as number;
    },
    stopAutoSelect() {
      this.isAutoSelecting = false;
      if (this.intervalId) {
        clearTimeout(this.intervalId);
        this.intervalId = null;
      }
      this.recordSelectedItem();
    },
    showMain() {
      this.showMainInterface = true;
      invoke('show_main_window');
      setTimeout(() => this.updateTrayMenu(), 100);
    },
    toggleMainInterface() {
      this.showMainInterface = !this.showMainInterface;
      if (this.showMainInterface) {
        invoke('show_main_window');
      } else {
        if (this.isSelecting || this.isAutoSelecting || this.isAnimating) {
          this.stopAnimation();
          this.stopAutoSelect();
          this.isSelecting = false;
          this.isAutoSelecting = false;
        }
        invoke('hide_main_window');
      }
      setTimeout(() => this.updateTrayMenu(), 100);
    },
    async emitWindowStateChange() {
      const { emit } = await import('@tauri-apps/api/event');
      await emit('window-state-changed');
    },
    async onSettingsRefresh() {
      await this.loadItems();
      await this.loadCustomTexts();
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
              <div>
                <span class="card-title" @click="($refs.settingsModal as SettingsModalInstance)?.openSettingsPanel()">{{ t('appTitle', 'Random Selector') }}</span>
                <span v-if="showVersion || (showAuthor && authorName)" class="version-info">
                  <span v-if="showVersion">v{{ appVersion }}</span>
                  <span v-if="showVersion && showAuthor && authorName" class="version-sep">&nbsp;</span>
                  <span v-if="showAuthor && authorName">by {{ authorName }}</span>
                </span>
              </div>
            </template>
            <div class="config-switcher" v-if="configs.length > 0">
              <a-select
                :value="currentConfigId"
                style="width: 250px"
                @change="handleSwitchConfig"
                size="large"
              >
                <a-select-option v-for="config in configs" :key="config.id" :value="config.id">
                  {{ config.name }}
                </a-select-option>
              </a-select>
            </div>
            <div class="result-display">
              <a-typography-title :level="1">
                {{ selectedItem ? selectedItem.name : t('hintText', 'Click "Start" button') }}
              </a-typography-title>
            </div>
            <div class="select-actions">
              <a-button v-if="!isSelecting" type="primary" size="large" @click="startManualSelect" :disabled="activeItems.length === 0" class="large-button">
                {{ t('btnStart', 'Start') }}
              </a-button>
              <a-button v-else type="primary" danger size="large" @click="stopManualSelect" class="large-button">
                {{ t('btnStop', 'Stop') }}
              </a-button>
              <a-button type="primary" size="large" @click="startAutoSelect" :disabled="activeItems.length === 0 || isAutoSelecting" class="large-button">
                {{ t('btnAuto', 'Auto') }}
              </a-button>
              <a-button @click="toggleFloating" type="primary" size="large" class="large-button">
                {{ showFloating ? t('btnHideFloat', 'Hide Float') : t('btnShowFloat', 'Show Float') }}
              </a-button>
            </div>
          </a-card>
        </div>
      </a-layout-content>
    </a-layout>

    <SettingsModal ref="settingsModal" v-model:open="showSettings" @refresh="onSettingsRefresh" />
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

.ant-card-head-title .version-info {
  font-size: 14px;
  font-weight: normal;
  color: #999;
  margin-left: 12px;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none !important;
}

.ant-card-head-title .version-sep {
  display: inline-block;
  width: 0.3em;
}

.config-switcher {
  padding: 8px 0 0 0;
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
  font-size: 96px !important;
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
  padding: 12px 24px;
  font-size: clamp(16px, 4vw, 22px);
  font-weight: 500;
  word-break: keep-all;
  flex: 0 1 auto;
}

.items-card {
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