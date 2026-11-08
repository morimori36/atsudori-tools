import { mountApp } from './ui/app';
import './ui/styles.css';
import './ui/event-planner.css';
import './ui/economy.css';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('missing app root');
mountApp(root);
