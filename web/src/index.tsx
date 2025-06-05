import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from "@material-tailwind/react";
import './styles/index.css';
import { App } from './App';
import { BlackjackProvider } from './services/App/AppHook';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <ThemeProvider>
            <BlackjackProvider>
                <App />
            </BlackjackProvider>
            {/* <FlipCard /> */}
        </ThemeProvider>
    </React.StrictMode>
);