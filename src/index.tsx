import React from 'react';
import {createRoot} from 'react-dom/client';
import FlipCard from './components/FlipCard';
import { ThemeProvider } from "@material-tailwind/react";
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <ThemeProvider>
            <FlipCard/>
        </ThemeProvider>
    </React.StrictMode>
);