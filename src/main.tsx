import { render } from 'preact';
import { App } from './app';
import './fonts.css';
import './styles.css';

const root = document.getElementById('app');
if (root) render(<App />, root);
