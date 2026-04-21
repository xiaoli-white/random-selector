import { createApp } from 'vue';
import FloatingWindow from './FloatingWindow.vue';
import Antd from 'ant-design-vue';

import 'ant-design-vue/dist/reset.css';

const app = createApp(FloatingWindow);
app.use(Antd);
app.mount('#app');
