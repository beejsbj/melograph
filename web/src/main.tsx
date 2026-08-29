import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { StyleGuide } from './styleguide/StyleGuide';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

const page = window.location.pathname === '/styleguide' ? <StyleGuide /> : <App />;
ReactDOM.createRoot(root).render(<React.StrictMode>{page}</React.StrictMode>);
